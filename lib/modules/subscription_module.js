// Online subscriber module: weekly meal plans sold to the public (in-house replacement for the Shopify site).
//
// Week cycle (one "week" = one delivery date):
//   admin builds the menu for a delivery date (draft) -> publishes it -> customers pick meals until the cutoff
//   -> cutoff run: subscribers who did not pick get chef's choice, saved cards are charged, orders lock
//   -> kitchen run: confirmed meals are totalled per dish into one indent per producing kitchen
//   -> delivery: orders marked delivered (packing slips / route sheet from the admin screen).
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');
const { signToken, hashPassword, verifyPassword } = require('../../common/auth');
const pay = require('./sub_payments');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const SHOP_ORG = process.env.SHOP_ORG_ID || 'TR';
const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });
const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
// The DB connection uses timezone 'Z': DATE values arrive as UTC midnight, and cutoff_at (a local wall-clock time)
// arrives as that wall-clock time in UTC - so both are read back with moment.utc.
const ymd = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : moment.utc(d).format('YYYY-MM-DD')) : null);
const wall = (d, f = 'YYYY-MM-DD HH:mm') => (d ? moment.utc(d).format(f) : null);
const nowLocal = () => moment().tz(TZ);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
const fsa = (postal) => String(postal || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
const STATUS_LABEL = { O: 'Choosing meals', P: 'Awaiting payment', C: 'Confirmed', F: 'Payment failed', K: 'In kitchen', D: 'Delivered', S: 'Skipped', X: 'Cancelled' };

// Notifications go to the server log until an e-mail provider is chosen.
const notify = (type, to, info) => console.info(`[shop-notify] ${type} -> ${to}: ${JSON.stringify(info)}`);

class SubscriptionModule extends BaseDao {
  // ---------- helpers ----------
  async _seq(conn, org_id, type, prefix) {
    await conn.query(`INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES (?, ?, 0)`, [type, org_id]);
    await conn.query(`UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1) WHERE seq_type = ? AND branch_id = ?`, [type, org_id]);
    const [r] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
    return `${prefix}${String(r.n).padStart(6, '0')}`;
  }

  async _settings(conn, org_id) {
    const [s] = await conn.query(`SELECT * FROM sub_settings WHERE org_id = ?`, [org_id]);
    return s || { org_id, delivery_weekday: 0, cutoff_days_before: 3, cutoff_time: '23:59', gst_rate: 5, qst_rate: 9.975, taxable: 'Y', min_meals: 5 };
  }

  _cutoffFor(delivery_date, s) {
    const [h, m] = String(s.cutoff_time || '23:59').split(':').map(Number);
    return moment.tz(delivery_date, 'YYYY-MM-DD', TZ).subtract(s.cutoff_days_before, 'days').hour(h).minute(m).second(0);
  }

  _price(plan, zone, s) {
    const subtotal = money(plan.price);
    const delivery_fee = money(zone ? zone.delivery_fee : 0);
    const base = subtotal + delivery_fee;
    const gst_amount = s.taxable === 'Y' ? money((base * Number(s.gst_rate)) / 100) : 0;
    const qst_amount = s.taxable === 'Y' ? money((base * Number(s.qst_rate)) / 100) : 0;
    return { subtotal, delivery_fee, gst_amount, qst_amount, total: money(base + gst_amount + qst_amount) };
  }

  async _zoneFor(conn, org_id, postal) {
    const p = fsa(postal);
    if (p.length < 3) return null;
    const zones = await conn.query(`SELECT * FROM sub_zone WHERE org_id = ? AND status = 'A' ORDER BY sort_order, zone_name`, [org_id]);
    return zones.find((z) => z.postal_prefixes.toUpperCase().split(/[\s,;]+/).filter(Boolean).some((x) => p.startsWith(x))) || null;
  }

  async _menu(conn, org_id, delivery_date) {
    return conn.query(
      `SELECT mi.product_id, mi.sort_order, mi.chef_pick, mi.max_qty,
              MAX(p.product_name) AS name, MAX(p.uom) AS uom, MAX(p.sub_description) AS description, MAX(p.sub_diet) AS diet,
              MAX(p.sub_allergens) AS allergens, MAX(p.sub_image_url) AS image_url,
              MAX(COALESCE(p.producing_branch_id, p.branch_id)) AS kitchen_id
         FROM sub_menu_item mi JOIN product_master p ON p.org_id = mi.org_id AND p.product_id = mi.product_id
        WHERE mi.org_id = ? AND mi.delivery_date = ?
        GROUP BY mi.product_id, mi.sort_order, mi.chef_pick, mi.max_qty
        ORDER BY mi.sort_order, name`, [org_id, delivery_date]);
  }

  /** The week customers can order for now: the earliest published week whose cutoff has not passed. */
  async _openWeek(conn, org_id) {
    const [w] = await conn.query(
      `SELECT * FROM sub_menu_week WHERE org_id = ? AND status = 'P' AND cutoff_at > ? ORDER BY delivery_date LIMIT 1`,
      [org_id, nowLocal().format('YYYY-MM-DD HH:mm:ss')]);
    return w || null;
  }

  _weekOut(w) {
    if (!w) return null;
    return { delivery_date: ymd(w.delivery_date), cutoff_at: wall(w.cutoff_at), status: w.status, note: w.note };
  }

  async _orderItems(conn, org_id, order_ids) {
    if (!order_ids.length) return {};
    const rows = await conn.query(
      `SELECT oi.order_id, oi.product_id, oi.qty, MAX(p.product_name) AS name
         FROM sub_order_item oi JOIN product_master p ON p.org_id = oi.org_id AND p.product_id = oi.product_id
        WHERE oi.org_id = ? AND oi.order_id IN (?) GROUP BY oi.order_id, oi.product_id, oi.qty ORDER BY name`, [org_id, order_ids]);
    const m = {};
    rows.forEach((r) => (m[r.order_id] = m[r.order_id] || []).push({ product_id: r.product_id, name: r.name, qty: r.qty }));
    return m;
  }

  _orderOut(o, items) {
    return {
      order_id: o.order_id, delivery_date: ymd(o.delivery_date), plan_id: o.plan_id, meals: o.meals, status: o.status,
      status_label: STATUS_LABEL[o.status] || o.status, picked_by: o.picked_by,
      subtotal: Number(o.subtotal), delivery_fee: Number(o.delivery_fee), gst_amount: Number(o.gst_amount),
      qst_amount: Number(o.qst_amount), total: Number(o.total),
      ship_name: o.ship_name, ship_phone: o.ship_phone, ship_address: o.ship_address, ship_postal: o.ship_postal,
      zone_id: o.zone_id, delivery_notes: o.delivery_notes, delivered_date: o.delivered_date,
      items: items || [],
    };
  }

  /** Validates a meal selection against the week's menu; returns { items } or { error }. */
  _checkItems(menu, meals, items) {
    const byId = Object.fromEntries(menu.map((m) => [m.product_id, m]));
    const clean = {};
    for (const it of items || []) {
      const q = parseInt(it.qty, 10);
      if (!q) continue;
      if (q < 0) return { error: 'Quantities must be positive' };
      if (!byId[it.product_id]) return { error: 'A selected meal is not on this week\'s menu' };
      clean[it.product_id] = (clean[it.product_id] || 0) + q;
    }
    const total = Object.values(clean).reduce((s, q) => s + q, 0);
    if (total !== meals) return { error: `Please choose exactly ${meals} meals (you have ${total})` };
    return { items: Object.entries(clean).map(([product_id, qty]) => ({ product_id, qty })) };
  }

  /** Chef's choice: spread the meals over the chef picks (or the whole menu), honouring a veg preference. */
  _chefChoice(menu, meals, diet_pref) {
    let pool = menu.filter((m) => m.chef_pick === 'Y');
    if (!pool.length) pool = menu.slice();
    if (diet_pref === 'V') {
      const veg = (pool.some((m) => m.diet === 'V') ? pool : menu).filter((m) => m.diet === 'V');
      if (veg.length) pool = veg;
    }
    const counts = {};
    for (let i = 0; i < meals; i++) counts[pool[i % pool.length].product_id] = (counts[pool[i % pool.length].product_id] || 0) + 1;
    return Object.entries(counts).map(([product_id, qty]) => ({ product_id, qty }));
  }

  _shipFrom(c) {
    return {
      ship_name: c.full_name, ship_phone: c.phone,
      ship_address: [c.address_line1, c.address_line2, c.city].filter(Boolean).join(', '),
      ship_postal: c.postal_code, zone_id: c.zone_id, delivery_notes: c.delivery_notes,
    };
  }

  async _writeItems(conn, org_id, order_id, items) {
    await conn.query(`DELETE FROM sub_order_item WHERE org_id = ? AND order_id = ?`, [org_id, order_id]);
    for (const it of items) {
      await conn.query(`INSERT INTO sub_order_item (org_id, order_id, product_id, qty) VALUES (?, ?, ?, ?)`, [org_id, order_id, it.product_id, it.qty]);
    }
  }

  // ---------- public (no login) ----------
  async shopInfo() {
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, SHOP_ORG);
      const plans = await conn.query(`SELECT plan_id, plan_name, meals_per_week, price, description FROM sub_plan WHERE org_id = ? AND status = 'A' ORDER BY sort_order, meals_per_week`, [SHOP_ORG]);
      const zones = await conn.query(`SELECT zone_name, delivery_fee FROM sub_zone WHERE org_id = ? AND status = 'A' ORDER BY sort_order, zone_name`, [SHOP_ORG]);
      const week = await this._openWeek(conn, SHOP_ORG);
      const menu = week ? await this._menu(conn, SHOP_ORG, ymd(week.delivery_date)) : [];
      return ok({
        shop: {
          name: s.shop_name || 'Weekly Meals', support_email: s.support_email, support_phone: s.support_phone,
          delivery_weekday: s.delivery_weekday, min_meals: s.min_meals, taxable: s.taxable,
          gst_rate: Number(s.gst_rate), qst_rate: Number(s.qst_rate), payment_mode: pay.MODE,
        },
        plans: plans.map((p) => ({ ...p, price: Number(p.price) })),
        zones: zones.map((z) => ({ ...z, delivery_fee: Number(z.delivery_fee) })),
        week: this._weekOut(week),
        menu: menu.map(({ kitchen_id, max_qty, ...m }) => m),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async zoneCheck(postal) {
    if (!POSTAL_RE.test(String(postal || '').trim())) return fail(400, 'Enter a valid postal code, e.g. H3B 1A7');
    const conn = await this.getReadConnection();
    try {
      const z = await this._zoneFor(conn, SHOP_ORG, postal);
      if (!z) return ok({ delivers: false, message: 'Sorry, we do not deliver to this postal code yet.' });
      return ok({ delivers: true, zone_name: z.zone_name, delivery_fee: Number(z.delivery_fee) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  _token(c, hub) {
    return signToken({ user_id: c.customer_id, org_id: c.org_id, branch_id: hub || '', user_type: 'S', user_name: c.full_name });
  }

  _customerOut(c) {
    return {
      customer_id: c.customer_id, email: c.email, full_name: c.full_name, phone: c.phone,
      address_line1: c.address_line1, address_line2: c.address_line2, city: c.city, postal_code: c.postal_code,
      zone_id: c.zone_id, delivery_notes: c.delivery_notes, diet_pref: c.diet_pref, allergies: c.allergies,
      card: c.card_last4 ? { brand: c.card_brand, last4: c.card_last4 } : null,
    };
  }

  _profileErrors(b, isNew) {
    if (isNew) {
      if (!EMAIL_RE.test(String(b.email || '').trim())) return 'Enter a valid e-mail address';
      if (!b.password || String(b.password).length < 8) return 'Password must be at least 8 characters';
    }
    if (!String(b.full_name || '').trim()) return 'Enter your name';
    if (!/^[\d\s()+-]{10,20}$/.test(String(b.phone || '').trim())) return 'Enter a valid phone number';
    if (!String(b.address_line1 || '').trim() || !String(b.city || '').trim()) return 'Enter your delivery address';
    if (!POSTAL_RE.test(String(b.postal_code || '').trim())) return 'Enter a valid postal code, e.g. H3B 1A7';
    return null;
  }

  _profileValues(b) {
    const pc = String(b.postal_code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      full_name: String(b.full_name).trim().slice(0, 150), phone: String(b.phone).trim().slice(0, 30),
      address_line1: String(b.address_line1).trim().slice(0, 200), address_line2: b.address_line2 ? String(b.address_line2).trim().slice(0, 200) : null,
      city: String(b.city).trim().slice(0, 100), postal_code: `${pc.slice(0, 3)} ${pc.slice(3)}`,
      delivery_notes: b.delivery_notes ? String(b.delivery_notes).slice(0, 500) : null,
      diet_pref: ['V', 'N'].includes(b.diet_pref) ? b.diet_pref : null,
      allergies: b.allergies ? String(b.allergies).slice(0, 300) : null,
    };
  }

  async signup(b) {
    const err = this._profileErrors(b || {}, true);
    if (err) return fail(400, err);
    const conn = await this.getWriteConnection();
    try {
      const zone = await this._zoneFor(conn, SHOP_ORG, b.postal_code);
      if (!zone) return fail(400, 'Sorry, we do not deliver to this postal code yet.');
      const email = String(b.email).trim().toLowerCase();
      const [exists] = await conn.query(`SELECT 1 FROM sub_customer WHERE org_id = ? AND email = ?`, [SHOP_ORG, email]);
      if (exists) return fail(409, 'An account with this e-mail already exists. Please log in.');
      const customer_id = await this._seq(conn, SHOP_ORG, 'SUBC', 'CU');
      const now = new Date();
      const c = { org_id: SHOP_ORG, customer_id, email, pwd: await hashPassword(b.password), ...this._profileValues(b), zone_id: zone.zone_id, status: 'A', created_date: now, updated_date: now };
      await conn.query(`INSERT INTO sub_customer SET ?`, [c]);
      const s = await this._settings(conn, SHOP_ORG);
      notify('welcome', email, { name: c.full_name });
      return ok({ token: this._token(c, s.hub_branch_id), customer: this._customerOut(c) });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async login(b) {
    const email = String((b && b.email) || '').trim().toLowerCase();
    const conn = await this.getReadConnection();
    try {
      const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND email = ?`, [SHOP_ORG, email]);
      if (!c || !(await verifyPassword(b.password, c.pwd))) return fail(401, 'E-mail or password is not correct');
      if (c.status !== 'A') return fail(401, 'This account is closed. Please contact us.');
      const s = await this._settings(conn, SHOP_ORG);
      return ok({ token: this._token(c, s.hub_branch_id), customer: this._customerOut(c) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- customer (logged in, type S) ----------
  async _customer(conn, user) {
    const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [user.org_id, user.user_id]);
    return c;
  }

  async _activeSub(conn, org_id, customer_id) {
    const [s] = await conn.query(
      `SELECT * FROM sub_subscription WHERE org_id = ? AND customer_id = ? AND status IN ('A','P','N') ORDER BY created_date DESC LIMIT 1`, [org_id, customer_id]);
    return s || null;
  }

  async me(user) {
    const conn = await this.getReadConnection();
    try {
      const c = await this._customer(conn, user);
      if (!c) return fail(404, 'Account not found');
      const sub = await this._activeSub(conn, c.org_id, c.customer_id);
      const plans = await conn.query(`SELECT plan_id, plan_name, meals_per_week, price FROM sub_plan WHERE org_id = ? AND status = 'A' ORDER BY sort_order`, [c.org_id]);
      const week = await this._openWeek(conn, c.org_id);
      const menu = week ? await this._menu(conn, c.org_id, ymd(week.delivery_date)) : [];
      const orders = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND customer_id = ? ORDER BY delivery_date DESC LIMIT 30`, [c.org_id, c.customer_id]);
      const items = await this._orderItems(conn, c.org_id, orders.map((o) => o.order_id));
      const payments = await conn.query(
        `SELECT order_id, amount, provider, status, card_brand, card_last4, receipt_url, failure_message, created_date
           FROM sub_payment WHERE org_id = ? AND customer_id = ? ORDER BY created_date DESC LIMIT 50`, [c.org_id, c.customer_id]);
      const zone = c.zone_id ? (await conn.query(`SELECT zone_name, delivery_fee FROM sub_zone WHERE org_id = ? AND zone_id = ?`, [c.org_id, c.zone_id]))[0] : null;
      const s = await this._settings(conn, c.org_id);
      const plan = sub ? plans.find((p) => p.plan_id === sub.plan_id) : null;
      return ok({
        customer: this._customerOut(c),
        zone: zone ? { zone_name: zone.zone_name, delivery_fee: Number(zone.delivery_fee) } : null,
        subscription: sub ? {
          subscription_id: sub.subscription_id, plan_id: sub.plan_id, plan_name: plan && plan.plan_name,
          meals_per_week: plan && plan.meals_per_week, price: plan && Number(plan.price),
          status: sub.status, paused_until: ymd(sub.paused_until), start_date: ymd(sub.start_date),
        } : null,
        plans: plans.map((p) => ({ ...p, price: Number(p.price) })),
        week: this._weekOut(week),
        menu: menu.map(({ kitchen_id, max_qty, ...m }) => m),
        orders: orders.map((o) => this._orderOut(o, items[o.order_id])),
        payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
        tax: { taxable: s.taxable, gst_rate: Number(s.gst_rate), qst_rate: Number(s.qst_rate) },
        payment_mode: pay.MODE,
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async updateProfile(user, b) {
    const err = this._profileErrors(b || {}, false);
    if (err) return fail(400, err);
    const conn = await this.getWriteConnection();
    try {
      const zone = await this._zoneFor(conn, user.org_id, b.postal_code);
      if (!zone) return fail(400, 'Sorry, we do not deliver to this postal code yet.');
      const v = { ...this._profileValues(b), zone_id: zone.zone_id, updated_date: new Date() };
      await conn.query(`UPDATE sub_customer SET ? WHERE org_id = ? AND customer_id = ?`, [v, user.org_id, user.user_id]);
      // open orders not yet charged follow the new address
      const c = await this._customer(conn, user);
      await conn.query(`UPDATE sub_order SET ?, updated_date = ? WHERE org_id = ? AND customer_id = ? AND status IN ('O','P','F')`,
        [this._shipFrom(c), new Date(), user.org_id, user.user_id]);
      return ok({ message: 'Details saved', customer: this._customerOut(c) });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async changePassword(user, b) {
    if (!b || !b.new_password || String(b.new_password).length < 8) return fail(400, 'New password must be at least 8 characters');
    const conn = await this.getWriteConnection();
    try {
      const c = await this._customer(conn, user);
      if (!c || !(await verifyPassword(b.current_password, c.pwd))) return fail(400, 'Current password is not correct');
      await conn.query(`UPDATE sub_customer SET pwd = ?, updated_date = ? WHERE org_id = ? AND customer_id = ?`,
        [await hashPassword(b.new_password), new Date(), user.org_id, user.user_id]);
      return ok({ message: 'Password changed' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Opening week, editable? */
  async _editableWeek(conn, org_id, delivery_date) {
    const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [org_id, delivery_date]);
    if (!w || w.status !== 'P') return { error: 'This week is not open for orders' };
    if (moment.tz(wall(w.cutoff_at, 'YYYY-MM-DD HH:mm:ss'), TZ).isBefore(nowLocal())) return { error: 'The order cutoff for this week has passed' };
    return { week: w };
  }

  /**
   * First order (new subscriber or restart): creates the subscription + order and returns the payment page.
   * body: { plan_id, items:[{product_id, qty}], success_url, cancel_url }
   */
  async start(user, b) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const c = await this._customer(conn, user);
      const week = await this._openWeek(conn, user.org_id);
      if (!week) { await conn.rollback(); return fail(400, 'Ordering is closed right now. The next menu will be published soon.'); }
      const delivery_date = ymd(week.delivery_date);
      const [plan] = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? AND plan_id = ? AND status = 'A'`, [user.org_id, b.plan_id]);
      if (!plan) { await conn.rollback(); return fail(400, 'Choose a plan'); }
      const menu = await this._menu(conn, user.org_id, delivery_date);
      const chk = this._checkItems(menu, plan.meals_per_week, b.items);
      if (chk.error) { await conn.rollback(); return fail(400, chk.error); }
      const zone = c.zone_id ? (await conn.query(`SELECT * FROM sub_zone WHERE org_id = ? AND zone_id = ?`, [c.org_id, c.zone_id]))[0] : null;
      if (!zone) { await conn.rollback(); return fail(400, 'Please add a delivery address we serve before ordering'); }
      const s = await this._settings(conn, user.org_id);
      const now = new Date();

      let sub = await this._activeSub(conn, c.org_id, c.customer_id);
      if (!sub) {
        sub = { org_id: c.org_id, subscription_id: await this._seq(conn, c.org_id, 'SUBS', 'SB'), customer_id: c.customer_id, plan_id: plan.plan_id, status: 'N', start_date: delivery_date, created_date: now, updated_date: now };
        // N = not yet paid; becomes A with the first successful payment (so abandoned checkouts never renew)
        await conn.query(`INSERT INTO sub_subscription SET ?`, [sub]);
      } else if (sub.plan_id !== plan.plan_id || sub.status === 'P') {
        await conn.query(`UPDATE sub_subscription SET plan_id = ?, status = IF(status = 'N', 'N', 'A'), paused_until = NULL, updated_date = ? WHERE org_id = ? AND subscription_id = ?`, [plan.plan_id, now, c.org_id, sub.subscription_id]);
      }

      const [existing] = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND customer_id = ? AND delivery_date = ?`, [c.org_id, c.customer_id, delivery_date]);
      if (existing && ['C', 'K', 'D'].includes(existing.status)) { await conn.rollback(); return fail(409, 'You already have a paid order for this delivery. Change its meals from your account.'); }
      const price = this._price(plan, zone, s);
      const order = {
        org_id: c.org_id, order_id: existing ? existing.order_id : await this._seq(conn, c.org_id, 'SUBO', 'SO'),
        customer_id: c.customer_id, subscription_id: sub.subscription_id, delivery_date, plan_id: plan.plan_id,
        meals: plan.meals_per_week, status: 'P', picked_by: 'C', ...price, ...this._shipFrom(c), updated_date: now,
      };
      if (existing) await conn.query(`UPDATE sub_order SET ? WHERE org_id = ? AND order_id = ?`, [order, c.org_id, order.order_id]);
      else await conn.query(`INSERT INTO sub_order SET ?`, [{ ...order, created_date: now }]);
      await this._writeItems(conn, c.org_id, order.order_id, chk.items);

      const co = await pay.createCheckout({
        order, customer: c, description: `${plan.plan_name} – ${plan.meals_per_week} meals, delivery ${moment(delivery_date).format('ddd D MMM YYYY')}`,
        successUrl: `${b.success_url}${String(b.success_url).includes('?') ? '&' : '?'}order=${order.order_id}`, cancelUrl: b.cancel_url,
      });
      if (co.stripe_customer_id && co.stripe_customer_id !== c.stripe_customer_id) {
        await conn.query(`UPDATE sub_customer SET stripe_customer_id = ? WHERE org_id = ? AND customer_id = ?`, [co.stripe_customer_id, c.org_id, c.customer_id]);
      }
      await conn.query(`INSERT INTO sub_payment (org_id, order_id, customer_id, amount, provider, provider_ref, status, created_date) VALUES (?, ?, ?, ?, ?, ?, 'P', ?)`,
        [c.org_id, order.order_id, c.customer_id, order.total, pay.MODE, co.ref, now]);
      await conn.commit();
      return ok({ order_id: order.order_id, checkout_url: co.url, payment_mode: pay.MODE });
    } catch (e) {
      try { await conn.rollback(); } catch (x) {}
      throw e;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async _activate(conn, org_id, order_id) {
    await conn.query(
      `UPDATE sub_subscription ss JOIN sub_order o ON o.org_id = ss.org_id AND o.subscription_id = ss.subscription_id
          SET ss.status = 'A', ss.updated_date = ? WHERE o.org_id = ? AND o.order_id = ? AND ss.status = 'N'`, [new Date(), org_id, order_id]);
  }

  /** Marks a checkout as paid (success page call, webhook, or admin). Idempotent. */
  async _markPaid(conn, ref, result) {
    const [p] = await conn.query(`SELECT * FROM sub_payment WHERE provider_ref = ? LIMIT 1`, [ref]);
    if (!p) return null;
    const now = new Date();
    if (p.status !== 'S') {
      await conn.query(`UPDATE sub_payment SET status = 'S', card_brand = ?, card_last4 = ?, receipt_url = ?, updated_date = ? WHERE payment_id = ?`,
        [result.brand, result.last4, result.receipt_url, now, p.payment_id]);
      await conn.query(`UPDATE sub_order SET status = 'C', updated_date = ? WHERE org_id = ? AND order_id = ? AND status IN ('O','P','F')`, [now, p.org_id, p.order_id]);
      await this._activate(conn, p.org_id, p.order_id);
      if (result.payment_method) {
        await conn.query(`UPDATE sub_customer SET stripe_payment_method = ?, card_brand = ?, card_last4 = ?, updated_date = ? WHERE org_id = ? AND customer_id = ?`,
          [result.payment_method, result.brand, result.last4, now, p.org_id, p.customer_id]);
      }
      const [c] = await conn.query(`SELECT email FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [p.org_id, p.customer_id]);
      notify('order_confirmed', c && c.email, { order_id: p.order_id, amount: Number(p.amount) });
    }
    return p;
  }

  async confirmPayment(user, ref) {
    if (!ref) return fail(400, 'Missing payment reference');
    const conn = await this.getWriteConnection();
    try {
      const [p] = await conn.query(`SELECT * FROM sub_payment WHERE provider_ref = ? AND org_id = ? AND customer_id = ?`, [ref, user.org_id, user.user_id]);
      if (!p) return fail(404, 'Payment not found');
      if (p.status === 'S') return ok({ paid: true, order_id: p.order_id });
      const r = await pay.verifyCheckout(ref);
      if (!r.paid) return ok({ paid: false, order_id: p.order_id, message: 'Payment not completed yet' });
      await this._markPaid(conn, ref, r);
      return ok({ paid: true, order_id: p.order_id });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async stripeWebhook(rawBody, signature) {
    const event = pay.webhookEvent(rawBody, signature);
    if (event.type === 'checkout.session.completed' && event.data.object.mode === 'payment') {
      const conn = await this.getWriteConnection();
      try {
        await this._markPaid(conn, event.data.object.id, await pay.verifyCheckout(event.data.object.id));
      } finally {
        await this.releaseWriteConnection(conn);
      }
    }
    return { received: true };
  }

  /** Subscriber changes meals for an upcoming week (before cutoff). Creates the week's order if needed. */
  async saveMeals(user, b) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const delivery_date = b.delivery_date;
      const ew = await this._editableWeek(conn, user.org_id, delivery_date);
      if (ew.error) { await conn.rollback(); return fail(400, ew.error); }
      const c = await this._customer(conn, user);
      const sub = await this._activeSub(conn, c.org_id, c.customer_id);
      if (!sub) { await conn.rollback(); return fail(400, 'Start a plan first'); }
      const [plan] = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? AND plan_id = ?`, [c.org_id, sub.plan_id]);
      const [existing] = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND customer_id = ? AND delivery_date = ?`, [c.org_id, c.customer_id, delivery_date]);
      const meals = existing ? existing.meals : plan.meals_per_week;
      const chk = this._checkItems(await this._menu(conn, c.org_id, delivery_date), meals, b.items);
      if (chk.error) { await conn.rollback(); return fail(400, chk.error); }
      const now = new Date();
      let order_id;
      if (existing) {
        if (['K', 'D', 'X'].includes(existing.status)) { await conn.rollback(); return fail(400, 'This order can no longer be changed'); }
        order_id = existing.order_id;
        const status = existing.status === 'S' ? 'O' : existing.status; // un-skip by choosing meals
        await conn.query(`UPDATE sub_order SET status = ?, picked_by = 'C', updated_date = ? WHERE org_id = ? AND order_id = ?`, [status, now, c.org_id, order_id]);
      } else {
        const zone = (await conn.query(`SELECT * FROM sub_zone WHERE org_id = ? AND zone_id = ?`, [c.org_id, c.zone_id]))[0];
        const price = this._price(plan, zone, await this._settings(conn, c.org_id));
        order_id = await this._seq(conn, c.org_id, 'SUBO', 'SO');
        await conn.query(`INSERT INTO sub_order SET ?`, [{
          org_id: c.org_id, order_id, customer_id: c.customer_id, subscription_id: sub.subscription_id, delivery_date,
          plan_id: plan.plan_id, meals: plan.meals_per_week, status: 'O', picked_by: 'C', ...price, ...this._shipFrom(c), created_date: now, updated_date: now,
        }]);
      }
      await this._writeItems(conn, c.org_id, order_id, chk.items);
      await conn.commit();
      return ok({ message: 'Meals saved', order_id });
    } catch (e) {
      try { await conn.rollback(); } catch (x) {}
      throw e;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Skip or un-skip a week (before cutoff). A paid order for that week is refunded by the admin. */
  async skipWeek(user, b) {
    const conn = await this.getWriteConnection();
    try {
      const ew = await this._editableWeek(conn, user.org_id, b.delivery_date);
      if (ew.error) return fail(400, ew.error);
      const c = await this._customer(conn, user);
      const sub = await this._activeSub(conn, c.org_id, c.customer_id);
      if (!sub) return fail(400, 'No active plan');
      const [o] = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND customer_id = ? AND delivery_date = ?`, [c.org_id, c.customer_id, b.delivery_date]);
      const now = new Date();
      if (b.skip === false) {
        if (o && o.status === 'S') await conn.query(`UPDATE sub_order SET status = 'O', updated_date = ? WHERE org_id = ? AND order_id = ?`, [now, c.org_id, o.order_id]);
        return ok({ message: 'This week is back on' });
      }
      if (o && ['C', 'K', 'D'].includes(o.status)) return fail(400, 'This week is already paid. Please contact us to cancel it.');
      if (o) await conn.query(`UPDATE sub_order SET status = 'S', updated_date = ? WHERE org_id = ? AND order_id = ?`, [now, c.org_id, o.order_id]);
      else {
        const [plan] = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? AND plan_id = ?`, [c.org_id, sub.plan_id]);
        await conn.query(`INSERT INTO sub_order SET ?`, [{
          org_id: c.org_id, order_id: await this._seq(conn, c.org_id, 'SUBO', 'SO'), customer_id: c.customer_id, subscription_id: sub.subscription_id,
          delivery_date: b.delivery_date, plan_id: plan.plan_id, meals: plan.meals_per_week, status: 'S', picked_by: 'C', ...this._shipFrom(c), created_date: now, updated_date: now,
        }]);
      }
      return ok({ message: 'Week skipped – you will not be charged for it' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** pause {weeks}, resume, cancel {reason}, change_plan {plan_id} (applies from the next order created) */
  async manageSubscription(user, b) {
    const conn = await this.getWriteConnection();
    try {
      const sub = await this._activeSub(conn, user.org_id, user.user_id);
      if (!sub) return fail(400, 'No active plan');
      const now = new Date();
      const set = (v) => conn.query(`UPDATE sub_subscription SET ?, updated_date = ? WHERE org_id = ? AND subscription_id = ?`, [v, now, user.org_id, sub.subscription_id]);
      if (sub.status === 'N' && ['pause', 'resume'].includes(b.action)) return fail(400, 'Please complete your first payment first');
      if (b.action === 'pause') {
        const weeks = Math.min(Math.max(parseInt(b.weeks, 10) || 1, 1), 12);
        const until = nowLocal().add(weeks, 'weeks').format('YYYY-MM-DD');
        await set({ status: 'P', paused_until: until });
        return ok({ message: `Paused until ${moment(until).format('D MMM YYYY')}` });
      }
      if (b.action === 'resume') { await set({ status: 'A', paused_until: null }); return ok({ message: 'Plan resumed' }); }
      if (b.action === 'cancel') {
        await set({ status: 'C', cancelled_date: now, cancel_reason: b.reason ? String(b.reason).slice(0, 300) : null });
        await conn.query(`UPDATE sub_order SET status = 'X', updated_date = ? WHERE org_id = ? AND subscription_id = ? AND status IN ('O','P','F')`, [now, user.org_id, sub.subscription_id]);
        notify('cancelled', user.user_id, { subscription_id: sub.subscription_id });
        return ok({ message: 'Your plan is cancelled. Paid deliveries still arrive as planned.' });
      }
      if (b.action === 'change_plan') {
        const [plan] = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? AND plan_id = ? AND status = 'A'`, [user.org_id, b.plan_id]);
        if (!plan) return fail(400, 'Choose a plan');
        await set({ plan_id: plan.plan_id });
        return ok({ message: `Changed to ${plan.plan_name}. It applies from the next week you have not ordered yet.` });
      }
      return fail(400, 'Unknown action');
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async cardSetup(user, b) {
    const conn = await this.getWriteConnection();
    try {
      const c = await this._customer(conn, user);
      const r = await pay.createCardSetup({ customer: c, successUrl: b.success_url, cancelUrl: b.cancel_url });
      if (r.stripe_customer_id && r.stripe_customer_id !== c.stripe_customer_id) {
        await conn.query(`UPDATE sub_customer SET stripe_customer_id = ? WHERE org_id = ? AND customer_id = ?`, [r.stripe_customer_id, c.org_id, c.customer_id]);
      }
      return ok({ url: r.url });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async cardConfirm(user, ref) {
    const r = await pay.verifyCardSetup(ref);
    if (!r.ok) return fail(400, 'The card was not saved');
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`UPDATE sub_customer SET stripe_payment_method = ?, card_brand = ?, card_last4 = ?, updated_date = ? WHERE org_id = ? AND customer_id = ?`,
        [r.payment_method, r.brand, r.last4, new Date(), user.org_id, user.user_id]);
      return ok({ message: 'Card updated', card: { brand: r.brand, last4: r.last4 } });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // ---------- admin ----------
  async getSettings(org_id) {
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, org_id);
      const branches = await conn.query(`SELECT branch_id, branch_name, branch_type FROM branch_master WHERE org_id = ? ORDER BY branch_name`, [org_id]);
      return ok({ settings: { ...s, gst_rate: Number(s.gst_rate), qst_rate: Number(s.qst_rate) }, branches, payment_mode: pay.MODE });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async saveSettings(user, b) {
    const v = {
      hub_branch_id: b.hub_branch_id || null,
      delivery_weekday: Math.min(Math.max(parseInt(b.delivery_weekday, 10) || 0, 0), 6),
      cutoff_days_before: Math.min(Math.max(parseInt(b.cutoff_days_before, 10) || 0, 0), 6),
      cutoff_time: /^\d{2}:\d{2}$/.test(b.cutoff_time || '') ? b.cutoff_time : '23:59',
      gst_rate: Number(b.gst_rate) || 0, qst_rate: Number(b.qst_rate) || 0, taxable: b.taxable === 'N' ? 'N' : 'Y',
      min_meals: Math.max(parseInt(b.min_meals, 10) || 1, 1),
      shop_name: b.shop_name ? String(b.shop_name).slice(0, 100) : null,
      support_email: b.support_email ? String(b.support_email).slice(0, 100) : null,
      support_phone: b.support_phone ? String(b.support_phone).slice(0, 30) : null,
      updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`INSERT INTO sub_settings SET ? ON DUPLICATE KEY UPDATE ?`, [{ org_id: user.org_id, ...v }, v]);
      return ok({ message: 'Settings saved' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async listPlans(org_id) {
    const conn = await this.getReadConnection();
    try {
      const rows = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? ORDER BY sort_order, meals_per_week`, [org_id]);
      return ok({ plans: rows.map((p) => ({ ...p, price: Number(p.price) })) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async savePlan(user, b) {
    const id = String(b.plan_id || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!id) return fail(400, 'Plan code is required');
    if (!String(b.plan_name || '').trim()) return fail(400, 'Plan name is required');
    const meals = parseInt(b.meals_per_week, 10);
    if (!(meals > 0 && meals <= 60)) return fail(400, 'Meals per week must be between 1 and 60');
    if (!(Number(b.price) > 0)) return fail(400, 'Price must be more than 0');
    const v = {
      plan_name: String(b.plan_name).trim().slice(0, 100), meals_per_week: meals, price: money(b.price),
      description: b.description ? String(b.description).slice(0, 500) : null, sort_order: parseInt(b.sort_order, 10) || 0,
      status: b.status === 'I' ? 'I' : 'A', updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`INSERT INTO sub_plan SET ? ON DUPLICATE KEY UPDATE ?`,
        [{ org_id: user.org_id, plan_id: id, ...v, created_by: user.user_id, created_date: new Date() }, v]);
      return ok({ message: 'Plan saved' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async listZones(org_id) {
    const conn = await this.getReadConnection();
    try {
      const rows = await conn.query(`SELECT * FROM sub_zone WHERE org_id = ? ORDER BY sort_order, zone_name`, [org_id]);
      return ok({ zones: rows.map((z) => ({ ...z, delivery_fee: Number(z.delivery_fee) })) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async saveZone(user, b) {
    const id = String(b.zone_id || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!id) return fail(400, 'Zone code is required');
    if (!String(b.zone_name || '').trim()) return fail(400, 'Zone name is required');
    const prefixes = String(b.postal_prefixes || '').toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (!prefixes.length) return fail(400, 'Add at least one postal code start, e.g. H3B');
    const bad = prefixes.find((p) => !/^[A-Z](\d([A-Z])?)?$/.test(p));
    if (bad) return fail(400, `"${bad}" is not a postal code start (use 1-3 characters like H, H3 or H3B)`);
    const v = {
      zone_name: String(b.zone_name).trim().slice(0, 100), postal_prefixes: prefixes.join(','),
      delivery_fee: money(b.delivery_fee || 0), status: b.status === 'I' ? 'I' : 'A', sort_order: parseInt(b.sort_order, 10) || 0,
      updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`INSERT INTO sub_zone SET ? ON DUPLICATE KEY UPDATE ?`,
        [{ org_id: user.org_id, zone_id: id, ...v, created_by: user.user_id, created_date: new Date() }, v]);
      return ok({ message: 'Zone saved' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Products with their online-menu details (description, diet, allergens, photo). */
  async listDishes(org_id) {
    const conn = await this.getReadConnection();
    try {
      const rows = await conn.query(
        `SELECT product_id, MAX(product_name) AS product_name, MAX(uom) AS uom, MAX(short_code) AS short_code,
                MAX(COALESCE(producing_branch_id, branch_id)) AS kitchen_id, MAX(sub_description) AS description,
                MAX(sub_diet) AS diet, MAX(sub_allergens) AS allergens, MAX(sub_image_url) AS image_url
           FROM product_master WHERE org_id = ? GROUP BY product_id ORDER BY product_name`, [org_id]);
      return ok({ dishes: rows });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async saveDish(user, b) {
    if (!b.product_id) return fail(400, 'product_id is required');
    if (b.image_url && !/^https?:\/\//i.test(b.image_url)) return fail(400, 'Photo link must start with http:// or https://');
    const conn = await this.getWriteConnection();
    try {
      const r = await conn.query(
        `UPDATE product_master SET sub_description = ?, sub_diet = ?, sub_allergens = ?, sub_image_url = ?, updated_by = ?, updated_date = ?
          WHERE org_id = ? AND product_id = ?`,
        [b.description ? String(b.description).slice(0, 500) : null, ['V', 'N', 'E'].includes(b.diet) ? b.diet : null,
          b.allergens ? String(b.allergens).slice(0, 200) : null, b.image_url ? String(b.image_url).slice(0, 500) : null,
          user.user_id, new Date(), user.org_id, b.product_id]);
      if (!r.affectedRows) return fail(404, 'Product not found');
      return ok({ message: 'Dish details saved' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async listWeeks(org_id) {
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, org_id);
      const weeks = await conn.query(
        `SELECT w.*, (SELECT COUNT(*) FROM sub_menu_item i WHERE i.org_id = w.org_id AND i.delivery_date = w.delivery_date) AS dishes,
                (SELECT COUNT(*) FROM sub_order o WHERE o.org_id = w.org_id AND o.delivery_date = w.delivery_date AND o.status IN ('C','K','D')) AS paid_orders
           FROM sub_menu_week w WHERE w.org_id = ? ORDER BY w.delivery_date DESC LIMIT 30`, [org_id]);
      // the next 6 delivery dates, for creating new weeks
      const next = [];
      const d = nowLocal().startOf('day');
      while (next.length < 6) { d.add(1, 'day'); if (d.day() === Number(s.delivery_weekday)) next.push(d.format('YYYY-MM-DD')); }
      return ok({
        weeks: weeks.map((w) => ({ ...this._weekOut(w), dishes: w.dishes, paid_orders: w.paid_orders, indent_numbers: w.indent_numbers })),
        next_dates: next.map((x) => ({ delivery_date: x, cutoff_at: this._cutoffFor(x, s).format('YYYY-MM-DD HH:mm') })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async getWeek(org_id, delivery_date) {
    const conn = await this.getReadConnection();
    try {
      const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [org_id, delivery_date]);
      if (!w) return fail(404, 'Week not found');
      return ok({ week: this._weekOut(w), items: await this._menu(conn, org_id, delivery_date) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Create or update a week's menu. body: { delivery_date, cutoff_at?, note, status:'D'|'P', items:[{product_id, chef_pick, max_qty}] } */
  async saveWeek(user, b) {
    if (!moment(b.delivery_date, 'YYYY-MM-DD', true).isValid()) return fail(400, 'Choose a delivery date');
    const items = (b.items || []).filter((i) => i.product_id);
    if (b.status === 'P' && items.length < 1) return fail(400, 'Add at least one dish before publishing');
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const s = await this._settings(conn, user.org_id);
      const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [user.org_id, b.delivery_date]);
      if (w && ['C', 'K'].includes(w.status)) { await conn.rollback(); return fail(400, 'This week is already cut off; the menu cannot change'); }
      const cutoff = b.cutoff_at && moment(b.cutoff_at, 'YYYY-MM-DD HH:mm', true).isValid() ? b.cutoff_at : this._cutoffFor(b.delivery_date, s).format('YYYY-MM-DD HH:mm');
      if (moment(cutoff, 'YYYY-MM-DD HH:mm').isAfter(moment(b.delivery_date, 'YYYY-MM-DD').endOf('day'))) { await conn.rollback(); return fail(400, 'The cutoff must be before the delivery date'); }
      const now = new Date();
      const v = { status: b.status === 'P' ? 'P' : 'D', cutoff_at: `${cutoff}:00`, note: b.note ? String(b.note).slice(0, 500) : null, updated_by: user.user_id, updated_date: now };
      await conn.query(`INSERT INTO sub_menu_week SET ? ON DUPLICATE KEY UPDATE ?`,
        [{ org_id: user.org_id, delivery_date: b.delivery_date, ...v, created_by: user.user_id, created_date: now }, v]);
      // dishes already in customers' baskets cannot be removed once the week is published
      if (w && w.status === 'P') {
        const used = await conn.query(
          `SELECT DISTINCT oi.product_id FROM sub_order_item oi JOIN sub_order o ON o.org_id = oi.org_id AND o.order_id = oi.order_id
            WHERE o.org_id = ? AND o.delivery_date = ? AND o.status NOT IN ('S','X')`, [user.org_id, b.delivery_date]);
        const keep = new Set(items.map((i) => i.product_id));
        const missing = used.filter((u) => !keep.has(u.product_id));
        if (missing.length) { await conn.rollback(); return fail(400, `Customers have already chosen ${missing.length} of the removed dish(es); keep them on the menu`); }
      }
      await conn.query(`DELETE FROM sub_menu_item WHERE org_id = ? AND delivery_date = ?`, [user.org_id, b.delivery_date]);
      let n = 0;
      for (const it of items) {
        await conn.query(`INSERT INTO sub_menu_item (org_id, delivery_date, product_id, sort_order, chef_pick, max_qty) VALUES (?, ?, ?, ?, ?, ?)`,
          [user.org_id, b.delivery_date, it.product_id, n++, it.chef_pick === 'Y' ? 'Y' : 'N', parseInt(it.max_qty, 10) > 0 ? parseInt(it.max_qty, 10) : null]);
      }
      await conn.commit();
      return ok({ message: v.status === 'P' ? 'Menu published – customers can order now' : 'Menu saved as draft' });
    } catch (e) {
      try { await conn.rollback(); } catch (x) {}
      throw e;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Orders for a delivery date + kitchen totals per dish + counts per zone. */
  async weekOrders(org_id, delivery_date) {
    const conn = await this.getReadConnection();
    try {
      const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [org_id, delivery_date]);
      const orders = await conn.query(
        `SELECT o.*, c.email FROM sub_order o JOIN sub_customer c ON c.org_id = o.org_id AND c.customer_id = o.customer_id
          WHERE o.org_id = ? AND o.delivery_date = ? ORDER BY o.zone_id, o.ship_postal, o.order_id`, [org_id, delivery_date]);
      const items = await this._orderItems(conn, org_id, orders.map((o) => o.order_id));
      const zones = Object.fromEntries((await conn.query(`SELECT zone_id, zone_name FROM sub_zone WHERE org_id = ?`, [org_id])).map((z) => [z.zone_id, z.zone_name]));
      const totals = {};
      orders.filter((o) => ['C', 'K', 'D'].includes(o.status)).forEach((o) => (items[o.order_id] || []).forEach((it) => {
        totals[it.product_id] = totals[it.product_id] || { product_id: it.product_id, name: it.name, qty: 0 };
        totals[it.product_id].qty += it.qty;
      }));
      const sum = (st) => orders.filter((o) => st.includes(o.status));
      const st = await this._settings(conn, org_id);
      return ok({
        week: this._weekOut(w),
        shop_name: st.shop_name,
        indent_numbers: w && w.indent_numbers,
        summary: {
          orders: orders.length, paid: sum(['C', 'K', 'D']).length, open: sum(['O', 'P']).length, failed: sum(['F']).length,
          skipped: sum(['S']).length, delivered: sum(['D']).length,
          meals: sum(['C', 'K', 'D']).reduce((s, o) => s + o.meals, 0),
          revenue: money(sum(['C', 'K', 'D']).reduce((s, o) => s + Number(o.total), 0)),
        },
        totals: Object.values(totals).sort((a, b) => b.qty - a.qty),
        orders: orders.map((o) => ({ ...this._orderOut(o, items[o.order_id]), email: o.email, zone_name: zones[o.zone_id] || o.zone_id })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /**
   * Cutoff run for a delivery date (admin button, or automatic when SUB_AUTO_CUTOFF=Y):
   *  1. active subscriptions without an order get chef's choice
   *  2. unpaid orders (open / awaiting payment / failed) are charged to the saved card
   *  3. the week locks (status C)
   */
  async runCutoff(user, delivery_date) {
    const conn = await this.getWriteConnection();
    const org_id = user.org_id;
    const result = { created: 0, charged: 0, failed: [], skipped_unpaid: 0 };
    try {
      const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [org_id, delivery_date]);
      if (!w) return fail(404, 'Week not found');
      if (w.status === 'D') return fail(400, 'Publish the menu first');
      if (w.status === 'K') return fail(400, 'This week has already been sent to the kitchen');
      const menu = await this._menu(conn, org_id, delivery_date);
      if (!menu.length) return fail(400, 'The menu has no dishes');
      const s = await this._settings(conn, org_id);
      const now = new Date();

      // 1. chef's choice for subscribers who did nothing
      const subs = await conn.query(
        `SELECT ss.*, c.diet_pref FROM sub_subscription ss JOIN sub_customer c ON c.org_id = ss.org_id AND c.customer_id = ss.customer_id
          WHERE ss.org_id = ? AND c.status = 'A' AND ss.start_date <= ?
            AND (ss.status = 'A' OR (ss.status = 'P' AND ss.paused_until IS NOT NULL AND ss.paused_until <= ?))
            AND NOT EXISTS (SELECT 1 FROM sub_order o WHERE o.org_id = ss.org_id AND o.customer_id = ss.customer_id AND o.delivery_date = ?)`,
        [org_id, delivery_date, delivery_date, delivery_date]);
      for (const sub of subs) {
        const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [org_id, sub.customer_id]);
        const [plan] = await conn.query(`SELECT * FROM sub_plan WHERE org_id = ? AND plan_id = ?`, [org_id, sub.plan_id]);
        const zone = (await conn.query(`SELECT * FROM sub_zone WHERE org_id = ? AND zone_id = ?`, [org_id, c.zone_id]))[0];
        const order_id = await this._seq(conn, org_id, 'SUBO', 'SO');
        await conn.query(`INSERT INTO sub_order SET ?`, [{
          org_id, order_id, customer_id: c.customer_id, subscription_id: sub.subscription_id, delivery_date, plan_id: plan.plan_id,
          meals: plan.meals_per_week, status: 'O', picked_by: 'A', ...this._price(plan, zone, s), ...this._shipFrom(c), created_date: now, updated_date: now,
        }]);
        await this._writeItems(conn, org_id, order_id, this._chefChoice(menu, plan.meals_per_week, sub.diet_pref));
        if (sub.status === 'P') await conn.query(`UPDATE sub_subscription SET status = 'A', paused_until = NULL WHERE org_id = ? AND subscription_id = ?`, [org_id, sub.subscription_id]);
        result.created++;
      }

      // 2. charge unpaid orders
      const unpaid = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND delivery_date = ? AND status IN ('O','P','F')`, [org_id, delivery_date]);
      for (const o of unpaid) {
        const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [org_id, o.customer_id]);
        // an order with no items (should not happen) gets chef's choice
        const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM sub_order_item WHERE org_id = ? AND order_id = ?`, [org_id, o.order_id]);
        if (!n) await this._writeItems(conn, org_id, o.order_id, this._chefChoice(menu, o.meals, c.diet_pref));
        const r = await pay.chargeSaved({ order: { ...o, delivery_date: ymd(o.delivery_date) }, customer: c });
        await conn.query(
          `INSERT INTO sub_payment (org_id, order_id, customer_id, amount, provider, provider_ref, status, card_brand, card_last4, receipt_url, failure_message, created_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [org_id, o.order_id, o.customer_id, o.total, pay.MODE, r.ref || null, r.ok ? 'S' : 'F', c.card_brand, c.card_last4, r.receipt_url || null, r.ok ? null : r.message, now]);
        await conn.query(`UPDATE sub_order SET status = ?, updated_date = ? WHERE org_id = ? AND order_id = ?`, [r.ok ? 'C' : 'F', now, org_id, o.order_id]);
        if (r.ok) { result.charged++; notify('order_confirmed', c.email, { order_id: o.order_id, amount: Number(o.total) }); }
        else { result.failed.push({ order_id: o.order_id, customer: c.full_name, message: r.message }); notify('payment_failed', c.email, { order_id: o.order_id }); }
      }

      // 3. lock the week
      await conn.query(`UPDATE sub_menu_week SET status = 'C', updated_by = ?, updated_date = ? WHERE org_id = ? AND delivery_date = ?`, [user.user_id, now, org_id, delivery_date]);
      return ok({
        message: `Cutoff done: ${result.created} chef's-choice order(s) created, ${result.charged} charged, ${result.failed.length} payment(s) failed`,
        ...result,
      });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Retry a failed payment (or mark it paid manually, e.g. e-Transfer received). */
  async chargeOrder(user, b) {
    const conn = await this.getWriteConnection();
    try {
      const [o] = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND order_id = ?`, [user.org_id, b.order_id]);
      if (!o) return fail(404, 'Order not found');
      if (!['O', 'P', 'F'].includes(o.status)) return fail(400, 'This order is not waiting for payment');
      const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [user.org_id, o.customer_id]);
      const now = new Date();
      let r;
      if (b.manual) r = { ok: true, ref: `manual_${user.user_id}_${Date.now()}`, provider: 'manual' };
      else r = await pay.chargeSaved({ order: { ...o, delivery_date: ymd(o.delivery_date) }, customer: c });
      await conn.query(
        `INSERT INTO sub_payment (org_id, order_id, customer_id, amount, provider, provider_ref, status, card_brand, card_last4, receipt_url, failure_message, created_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.org_id, o.order_id, o.customer_id, o.total, r.provider || pay.MODE, r.ref || null, r.ok ? 'S' : 'F',
          b.manual ? null : c.card_brand, b.manual ? null : c.card_last4, r.receipt_url || null, r.ok ? (b.manual ? String(b.note || 'Marked paid').slice(0, 500) : null) : r.message, now]);
      await conn.query(`UPDATE sub_order SET status = ?, updated_date = ? WHERE org_id = ? AND order_id = ?`, [r.ok ? 'C' : 'F', now, user.org_id, o.order_id]);
      if (r.ok) await this._activate(conn, user.org_id, o.order_id);
      return r.ok ? ok({ message: 'Payment recorded' }) : fail(402, `Payment failed: ${r.message}`);
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** Mark delivered / cancel / not delivered. body: { order_ids:[...], status:'D'|'X'|'K', note } */
  async setOrderStatus(user, b) {
    const ids = (b.order_ids || []).filter(Boolean);
    if (!ids.length) return fail(400, 'Choose at least one order');
    if (!['D', 'X', 'K'].includes(b.status)) return fail(400, 'Unknown status');
    const conn = await this.getWriteConnection();
    try {
      const now = new Date();
      const allowed = b.status === 'D' ? ['C', 'K'] : b.status === 'K' ? ['D'] : ['O', 'P', 'F', 'C', 'K'];
      const r = await conn.query(
        `UPDATE sub_order SET status = ?, delivered_date = ?, delivered_by = ?, updated_date = ? WHERE org_id = ? AND order_id IN (?) AND status IN (?)`,
        [b.status, b.status === 'D' ? now : null, b.status === 'D' ? user.user_id : null, now, user.org_id, ids, allowed]);
      const msg = { D: 'marked delivered', X: 'cancelled', K: 'moved back to not delivered' }[b.status];
      return ok({ message: `${r.affectedRows} order(s) ${msg}${b.status === 'X' ? '. Refund any payment from the Stripe dashboard.' : ''}` });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /**
   * Kitchen run: totals confirmed meals per dish and raises one indent per producing kitchen from the hub branch,
   * using the normal indent flow (kitchen accepts, finalize, dispatch with batches, receipt).
   */
  async sendToKitchen(user, delivery_date) {
    const { IndentModule } = require('./indent_module');
    const conn = await this.getWriteConnection();
    try {
      const [w] = await conn.query(`SELECT * FROM sub_menu_week WHERE org_id = ? AND delivery_date = ?`, [user.org_id, delivery_date]);
      if (!w) return fail(404, 'Week not found');
      if (w.status !== 'C') return fail(400, w.status === 'K' ? `Already sent to the kitchen (${w.indent_numbers})` : 'Run the cutoff first');
      const s = await this._settings(conn, user.org_id);
      if (!s.hub_branch_id) return fail(400, 'Choose the hub branch in Shop settings first');
      const rows = await conn.query(
        `SELECT oi.product_id, SUM(oi.qty) AS qty, MAX(p.product_name) AS name, MAX(p.product_price) AS price,
                MAX(COALESCE(p.producing_branch_id, p.branch_id)) AS kitchen_id
           FROM sub_order o JOIN sub_order_item oi ON oi.org_id = o.org_id AND oi.order_id = o.order_id
           JOIN product_master p ON p.org_id = oi.org_id AND p.product_id = oi.product_id
          WHERE o.org_id = ? AND o.delivery_date = ? AND o.status = 'C'
          GROUP BY oi.product_id`, [user.org_id, delivery_date]);
      if (!rows.length) return fail(400, 'No confirmed (paid) orders to send');
      const byKitchen = {};
      rows.forEach((r) => (byKitchen[r.kitchen_id] = byKitchen[r.kitchen_id] || []).push(r));
      const numbers = [];
      // the kitchen should have everything ready the evening before delivery
      const readyBy = moment.tz(delivery_date, 'YYYY-MM-DD', TZ).subtract(1, 'day').hour(18).minute(0).toISOString();
      for (const [kitchen_id, list] of Object.entries(byKitchen)) {
        const res = await new IndentModule().createIndentData({
          org_id: user.org_id, branch_id: s.hub_branch_id, user_id: user.user_id, status: 'C', kitchen_id,
          self_customer: 'S', priority_flag: 'N', delivery_by_datetime: readyBy,
          indent_details: list.map((r) => ({ item_code: r.product_id, item_name: r.name, item_cost: r.price, qty_ordered: Number(r.qty), mandatory_status: 'N' })),
        });
        const no = res && res.indent && res.indent.indent_number;
        if (no) numbers.push(no);
      }
      const now = new Date();
      await conn.query(`UPDATE sub_order SET status = 'K', updated_date = ? WHERE org_id = ? AND delivery_date = ? AND status = 'C'`, [now, user.org_id, delivery_date]);
      await conn.query(`UPDATE sub_menu_week SET status = 'K', indent_numbers = ?, updated_by = ?, updated_date = ? WHERE org_id = ? AND delivery_date = ?`,
        [numbers.join(', ').slice(0, 200), user.user_id, now, user.org_id, delivery_date]);
      return ok({ message: `Sent to the kitchen: ${numbers.join(', ') || 'indent created'}`, indent_numbers: numbers });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async listCustomers(org_id, q) {
    const conn = await this.getReadConnection();
    try {
      const rows = await conn.query(
        `SELECT c.customer_id, c.email, c.full_name, c.phone, c.city, c.postal_code, c.zone_id, c.status, c.created_date,
                c.card_brand, c.card_last4,
                (SELECT ss.status FROM sub_subscription ss WHERE ss.org_id = c.org_id AND ss.customer_id = c.customer_id ORDER BY ss.created_date DESC LIMIT 1) AS sub_status,
                (SELECT ss.plan_id FROM sub_subscription ss WHERE ss.org_id = c.org_id AND ss.customer_id = c.customer_id ORDER BY ss.created_date DESC LIMIT 1) AS plan_id,
                (SELECT COUNT(*) FROM sub_order o WHERE o.org_id = c.org_id AND o.customer_id = c.customer_id AND o.status IN ('C','K','D')) AS paid_orders,
                (SELECT COALESCE(SUM(p.amount),0) FROM sub_payment p WHERE p.org_id = c.org_id AND p.customer_id = c.customer_id AND p.status = 'S') AS total_paid,
                (SELECT MAX(o.delivery_date) FROM sub_order o WHERE o.org_id = c.org_id AND o.customer_id = c.customer_id AND o.status IN ('C','K','D')) AS last_delivery
           FROM sub_customer c WHERE c.org_id = ? ${q ? 'AND (c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)' : ''}
          ORDER BY c.created_date DESC LIMIT 500`, q ? [org_id, `%${q}%`, `%${q}%`, `%${q}%`] : [org_id]);
      return ok({ customers: rows.map((r) => ({ ...r, total_paid: Number(r.total_paid), last_delivery: ymd(r.last_delivery) })) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async customerDetail(org_id, customer_id) {
    const conn = await this.getReadConnection();
    try {
      const [c] = await conn.query(`SELECT * FROM sub_customer WHERE org_id = ? AND customer_id = ?`, [org_id, customer_id]);
      if (!c) return fail(404, 'Subscriber not found');
      const subs = await conn.query(`SELECT * FROM sub_subscription WHERE org_id = ? AND customer_id = ? ORDER BY created_date DESC`, [org_id, customer_id]);
      const orders = await conn.query(`SELECT * FROM sub_order WHERE org_id = ? AND customer_id = ? ORDER BY delivery_date DESC LIMIT 52`, [org_id, customer_id]);
      const items = await this._orderItems(conn, org_id, orders.map((o) => o.order_id));
      const payments = await conn.query(`SELECT * FROM sub_payment WHERE org_id = ? AND customer_id = ? ORDER BY created_date DESC LIMIT 100`, [org_id, customer_id]);
      return ok({
        customer: this._customerOut(c),
        subscriptions: subs.map((x) => ({ ...x, start_date: ymd(x.start_date), paused_until: ymd(x.paused_until) })),
        orders: orders.map((o) => this._orderOut(o, items[o.order_id])),
        payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Automatic cutoff (SUB_AUTO_CUTOFF=Y): weeks whose cutoff passed are cut off by the system user. */
  async autoCutoff() {
    const conn = await this.getReadConnection();
    let due = [];
    try {
      due = await conn.query(`SELECT org_id, delivery_date FROM sub_menu_week WHERE status = 'P' AND cutoff_at <= ?`, [nowLocal().format('YYYY-MM-DD HH:mm:ss')]);
    } finally {
      await this.releaseReadConnection(conn);
    }
    for (const w of due) {
      const r = await this.runCutoff({ org_id: w.org_id, user_id: 'system' }, ymd(w.delivery_date));
      console.info(`[shop] auto cutoff ${w.org_id} ${ymd(w.delivery_date)}: ${r.message}`);
    }
  }
}

const subscriptionModule = new SubscriptionModule();
if (process.env.SUB_AUTO_CUTOFF === 'Y') {
  setInterval(() => subscriptionModule.autoCutoff().catch((e) => console.error('[shop] auto cutoff failed:', e.message)), 15 * 60 * 1000);
}

module.exports = { subscriptionModule, STATUS_LABEL };
