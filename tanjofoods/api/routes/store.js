// Public storefront API:  /api/...
const express = require("express");
const crypto = require("crypto");
const { pool, tx } = require("../db");
const cfgStore = require("../lib/store-settings");
const mail = require("../lib/mailer");
const conf = require("../config");
const { applyDuePrices } = require("../lib/prices");
const images = require("../lib/images");

const router = express.Router();
const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const PREP = { READY_TO_EAT: "Ready to Eat", READY_TO_COOK: "Ready to Cook", READY_TO_DRINK: "Ready to Drink" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

class BadRequest extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function localDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
router.get("/health", wrap(async (req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true, db: conf.db.name, payment_mode: conf.paymentMode() });
}));

/* Store settings for the front end (keeps cart totals in line with the server) */
router.get("/config", wrap(async (req, res) => {
  const c = await cfgStore.load();
  const z = c.zones[0];
  res.json({
    currency: c.settings.currency || "CAD",
    minOrder: z ? Number(z.min_order) : c.minOrder,
    deliveryFee: z ? Number(z.delivery_fee) : c.defaultDeliveryFee,
    freeDeliveryOver: z && z.free_over != null ? Number(z.free_over) : c.freeDeliveryOver,
    leadDays: z ? z.lead_time_days : c.leadDays,
    taxes: c.taxes.map(t => ({ code: t.code, name: t.name, rate: t.rate })),
    slots: c.slots,
    pickupAddress: c.settings.store_address, email: c.settings.store_email, phone: c.settings.store_phone,
    paymentMode: conf.paymentMode(),
  });
}));

/* Catalogue */
router.get("/products", wrap(async (req, res) => {
  await Promise.all([applyDuePrices(), images.scanIfStale()]);   // scheduled prices + photos dropped into the folder
  const [cats] = await pool.query(
    `SELECT c.code, c.name_en AS name, c.name_fr AS nameFr, c.description_en AS blurb, c.description_fr AS blurbFr
       FROM categories c WHERE c.is_active = 1 AND EXISTS (SELECT 1 FROM v_storefront_products v WHERE v.category_code = c.code)
      ORDER BY c.sort_order`);
  const [rows] = await pool.query("SELECT * FROM v_storefront_products ORDER BY category_code, sort_order, name_en");
  res.json({
    categories: cats,
    products: rows.map(p => ({
      sku: p.sku, category: p.category_code, name: p.name_en, nameFr: p.name_fr || "", regional: p.regional_name || "",
      desc: p.short_desc_en || "", descFr: p.short_desc_fr || "", size: p.pack_size_label || "", price: Number(p.price),
      image: p.image_file || "", tags: (p.dietary_tags || "").split(",").map(t => t.trim()).filter(Boolean),
      prep: PREP[p.prep_type] || "", taxable: !!p.is_taxable, featured: !!p.is_featured, maxQty: p.max_order_qty,
      status: p.status === "COMING_SOON" ? "coming_soon" : (p.status === "OUT_OF_STOCK" || p.is_sold_out) ? "sold_out" : "active",
    })),
  });
}));

/* ------------------------------------------------------------------ */
/* Place an order – everything is re-priced here; client totals are ignored */
router.post("/orders", wrap(async (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  const fulfil = String(b.fulfilment_type || "").toUpperCase();
  const pay = String(b.payment_method || "").toUpperCase();
  const lang = b.lang === "fr" ? "fr" : "en";
  const name = String(c.name || "").trim(), email = String(c.email || "").trim().toLowerCase(), phone = String(c.phone || "").trim();

  if (!name || !phone || !EMAIL_RE.test(email)) throw new BadRequest("Please enter your name, phone and a valid e-mail.");
  if (!["DELIVERY", "PICKUP"].includes(fulfil)) throw new BadRequest("Choose delivery or pickup.");
  if (!["CARD", "PAY_ON_DELIVERY"].includes(pay)) throw new BadRequest("Choose a payment method.");
  if (!Array.isArray(b.items) || !b.items.length) throw new BadRequest("Your cart is empty.");

  const cfg = await cfgStore.load();
  await applyDuePrices();
  let zone = null, addr = null;
  if (fulfil === "DELIVERY") {
    const a = b.address || {};
    if (!String(a.line1 || "").trim()) throw new BadRequest("Please enter your street address.");
    if (!POSTAL_RE.test(String(a.postal_code || "").trim())) throw new BadRequest("Please enter a valid postal code, e.g. H2X 1Y4.");
    zone = cfgStore.zoneFor(cfg, a.postal_code);
    if (!zone) throw new BadRequest("Sorry, we don't deliver to that postal code yet – please choose pickup.");
    const pc = a.postal_code.replace(/[\s-]/g, "").toUpperCase();
    addr = { line1: a.line1.trim().slice(0, 150), line2: String(a.line2 || "").trim().slice(0, 150) || null,
             city: "Montreal", province: "QC", postal: pc.slice(0, 3) + " " + pc.slice(3) };
  }
  const lead = zone ? zone.lead_time_days : cfg.leadDays;
  const date = String(b.scheduled_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDate(lead)) throw new BadRequest(`Earliest available date is ${localDate(lead)}.`);
  const slot = String(b.time_slot || "").slice(0, 30);

  // merge duplicate SKUs
  const qtyBySku = {};
  for (const it of b.items) {
    const q = parseInt(it.qty, 10);
    if (!it.sku || !(q > 0)) throw new BadRequest("Invalid item in cart.");
    qtyBySku[it.sku] = (qtyBySku[it.sku] || 0) + q;
  }

  const result = await tx(async conn => {
    const skus = Object.keys(qtyBySku);
    const [prods] = await conn.query(
      `SELECT p.product_id, p.sku, p.name_en, p.name_fr, p.pack_size_label, p.price, p.is_taxable, p.status, p.max_order_qty,
              i.qty_on_hand, i.qty_reserved, i.track_inventory, i.allow_backorder
         FROM products p LEFT JOIN inventory i ON i.product_id = p.product_id
        WHERE p.sku IN (?) FOR UPDATE`, [skus]);
    const bySku = Object.fromEntries(prods.map(p => [p.sku, p]));

    const lines = [];
    let subtotal = 0, taxableBase = 0;
    for (const sku of skus) {
      const p = bySku[sku], qty = qtyBySku[sku];
      if (!p || p.status !== "ACTIVE" || !(p.price > 0)) throw new BadRequest(`"${p ? p.name_en : sku}" is not available to order right now.`, 409);
      if (qty > p.max_order_qty) throw new BadRequest(`Maximum ${p.max_order_qty} of "${p.name_en}" per order.`);
      if (p.track_inventory && !p.allow_backorder && qty > (p.qty_on_hand - p.qty_reserved))
        throw new BadRequest(`Only ${Math.max(0, p.qty_on_hand - p.qty_reserved)} of "${p.name_en}" left in stock.`, 409);
      const line = r2(p.price * qty);
      subtotal = r2(subtotal + line);
      if (p.is_taxable) taxableBase = r2(taxableBase + line);
      lines.push({ p, qty, line });
    }
    const minOrder = zone ? Number(zone.min_order) : cfg.minOrder;
    if (subtotal < minOrder) throw new BadRequest(`Minimum order is $${minOrder.toFixed(2)}.`);

    let deliveryFee = 0;
    if (fulfil === "DELIVERY") {
      const freeOver = zone.free_over != null ? Number(zone.free_over) : cfg.freeDeliveryOver;
      deliveryFee = freeOver != null && subtotal >= freeOver ? 0 : Number(zone.delivery_fee);
    }
    // Delivery fee follows the tax status of the goods: taxed only if taxable goods are in the order (confirm with accountant)
    const taxBase = r2(taxableBase + (taxableBase > 0 ? deliveryFee : 0));
    const tax = Object.fromEntries(cfg.taxes.map(t => [t.code, r2(taxBase * t.rate)]));
    const gst = tax.GST || 0, qst = tax.QST || 0;
    const total = r2(subtotal + deliveryFee + gst + qst);

    // customer (guest record, keyed by e-mail)
    const [first, ...rest] = name.split(/\s+/);
    await conn.query(
      `INSERT INTO customers (email, first_name, last_name, phone, preferred_lang) VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), phone = VALUES(phone), preferred_lang = VALUES(preferred_lang)`,
      [email, first.slice(0, 80), rest.join(" ").slice(0, 80) || null, phone.slice(0, 30), lang]);
    const [[cust]] = await conn.query("SELECT customer_id FROM customers WHERE email = ?", [email]);
    if (addr) {
      const [[exists]] = await conn.query("SELECT address_id FROM customer_addresses WHERE customer_id=? AND line1=? AND postal_code=?",
        [cust.customer_id, addr.line1, addr.postal]);
      if (!exists) await conn.query("INSERT INTO customer_addresses (customer_id, line1, line2, city, province, postal_code, is_default) VALUES (?,?,?,?,?,?,1)",
        [cust.customer_id, addr.line1, addr.line2, addr.city, addr.province, addr.postal]);
    }

    // order number  TF-YYMMDD-0001
    const ymd = localDate(0).slice(2).replace(/-/g, "");
    const [[{ n }]] = await conn.query("SELECT COUNT(*) n FROM orders WHERE order_no LIKE ?", [`${cfg.prefix}-${ymd}-%`]);
    const orderNo = `${cfg.prefix}-${ymd}-${String(n + 1).padStart(4, "0")}`;
    const token = crypto.randomBytes(16).toString("hex");
    const status = pay === "PAY_ON_DELIVERY" ? "CONFIRMED" : "PENDING";

    const [ins] = await conn.query(
      `INSERT INTO orders (order_no, access_token, customer_id, cust_name, cust_email, cust_phone, fulfilment_type, scheduled_date, time_slot,
         ship_line1, ship_line2, ship_city, ship_province, ship_postal_code, delivery_zone_id,
         subtotal, delivery_fee, gst_amount, qst_amount, grand_total, status, payment_status, payment_method, channel, lang, customer_notes, ip_address)
       VALUES (?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,'UNPAID',?,'WEB',?,?,?)`,
      [orderNo, token, cust.customer_id, name.slice(0, 160), email, phone.slice(0, 30), fulfil, date, slot,
       addr?.line1 || null, addr?.line2 || null, addr?.city || null, addr?.province || null, addr?.postal || null, zone?.zone_id || null,
       subtotal, deliveryFee, gst, qst, total, status, pay, lang, String(b.notes || "").slice(0, 500) || null, req.ip]);
    const orderId = ins.insertId;

    for (const { p, qty, line } of lines) {
      await conn.query(
        `INSERT INTO order_items (order_id, product_id, sku, product_name, pack_size_label, unit_price, qty, is_taxable, line_total)
         VALUES (?,?,?,?,?,?,?,?,?)`, [orderId, p.product_id, p.sku, p.name_en, p.pack_size_label, p.price, qty, p.is_taxable, line]);
      if (p.track_inventory) {
        await conn.query("UPDATE inventory SET qty_on_hand = qty_on_hand - ? WHERE product_id = ?", [qty, p.product_id]);
        await conn.query("INSERT INTO inventory_transactions (product_id, txn_type, qty, ref_order_id, note) VALUES (?, 'SALE', ?, ?, ?)",
          [p.product_id, -qty, orderId, orderNo]);
      }
    }
    await conn.query("INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?, NULL, ?, ?)",
      [orderId, status, pay === "CARD" ? "Order created – awaiting payment" : "Order placed – pay on " + fulfil.toLowerCase()]);
    return { orderId, orderNo, token, status, total };
  });

  console.log(`[order] ${result.orderNo}  ${fulfil}  $${result.total.toFixed(2)}  ${pay}  ${email}`);
  if (pay === "PAY_ON_DELIVERY") await sendOrderEmails(result.orderNo);

  const out = { order_no: result.orderNo, token: result.token, status: result.status, grand_total: result.total };
  if (pay === "CARD") out.payment_url = `mock-pay.html?order=${encodeURIComponent(result.orderNo)}&t=${result.token}`;
  res.status(201).json(out);
}));

/* Order lookup for the customer (needs the token from the order response / e-mail link) */
async function getOrder(orderNo, token) {
  const [[o]] = await pool.query("SELECT * FROM orders WHERE order_no = ?", [orderNo]);
  if (!o || !token || o.access_token !== token) return null;
  const [items] = await pool.query(
    `SELECT oi.sku, oi.product_name, p.name_fr AS product_name_fr, oi.pack_size_label, oi.unit_price, oi.qty, oi.line_total
       FROM order_items oi LEFT JOIN products p ON p.product_id = oi.product_id WHERE oi.order_id = ?`, [o.order_id]);
  return { o, items };
}
router.get("/orders/:orderNo", wrap(async (req, res) => {
  const r = await getOrder(req.params.orderNo, req.query.t);
  if (!r) return res.status(404).json({ error: "Order not found" });
  const { o, items } = r;
  res.json({
    order_no: o.order_no, status: o.status, payment_status: o.payment_status, payment_method: o.payment_method,
    fulfilment_type: o.fulfilment_type, scheduled_date: o.scheduled_date, time_slot: o.time_slot,
    name: o.cust_name, email: o.cust_email, lang: o.lang,
    address: o.ship_line1 ? `${o.ship_line1}${o.ship_line2 ? ", " + o.ship_line2 : ""}, ${o.ship_city} ${o.ship_province} ${o.ship_postal_code}` : null,
    subtotal: o.subtotal, delivery_fee: o.delivery_fee, gst: o.gst_amount, qst: o.qst_amount, grand_total: o.grand_total,
    items, created_at: o.created_at,
  });
}));

/* ------------------------------------------------------------------ */
/* MOCK payment – stands in for Stripe/Square until a gateway is integrated */
router.post("/payments/mock/:orderNo", wrap(async (req, res) => {
  if (conf.paymentMode() !== "MOCK") throw new BadRequest("Mock payments are disabled.", 403);
  const { t, outcome } = req.body || {};
  const out = await tx(async conn => {
    const [[o]] = await conn.query("SELECT * FROM orders WHERE order_no = ? FOR UPDATE", [req.params.orderNo]);
    if (!o || o.access_token !== t) throw new BadRequest("Order not found", 404);
    if (o.payment_status === "PAID") return { already: true, o };
    if (o.status === "CANCELLED") throw new BadRequest("This order was cancelled.", 409);
    const success = outcome === "success";
    const ref = "mock_" + crypto.randomBytes(8).toString("hex");
    await conn.query(
      `INSERT INTO payments (order_id, provider, provider_ref, txn_type, amount, status, card_brand, card_last4, raw_response)
       VALUES (?, 'MOCK', ?, 'SALE', ?, ?, 'VISA', '4242', ?)`,
      [o.order_id, ref, o.grand_total, success ? "SUCCEEDED" : "FAILED",
       JSON.stringify({ mode: "MOCK", outcome: success ? "approved" : "declined", at: new Date().toISOString() })]);
    if (success) {
      await conn.query("UPDATE orders SET payment_status='PAID', status='CONFIRMED' WHERE order_id=?", [o.order_id]);
      await conn.query("INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?,?,?,?)",
        [o.order_id, o.status, "CONFIRMED", `Payment received (MOCK ${ref})`]);
    } else {
      await conn.query("UPDATE orders SET payment_status='FAILED' WHERE order_id=?", [o.order_id]);
      await conn.query("INSERT INTO order_status_history (order_id, from_status, to_status, note) VALUES (?,?,?,?)",
        [o.order_id, o.status, o.status, "Payment declined (MOCK)"]);
    }
    return { success, o };
  });
  if (out.success) { console.log(`[payment] ${req.params.orderNo} PAID (mock)`); await sendOrderEmails(req.params.orderNo); }
  else if (!out.already) console.log(`[payment] ${req.params.orderNo} DECLINED (mock)`);
  res.json({ ok: !!(out.success || out.already), paid: !!(out.success || out.already),
             redirect: `./#/order/${encodeURIComponent(req.params.orderNo)}?t=${t}` });
}));

/* ------------------------------------------------------------------ */
router.post("/enquiries", wrap(async (req, res) => {
  const b = req.body || {};
  const types = ["Product Enquiry", "Wholesale / Bulk Enquiry", "Distribution Partnership", "General Enquiry"];
  if (!String(b.full_name || "").trim() || !EMAIL_RE.test(String(b.email || "").trim()) || !types.includes(b.enquiry_type) || !String(b.message || "").trim())
    throw new BadRequest("Please complete the required fields.");
  const [r] = await pool.query(
    "INSERT INTO enquiries (full_name, email, phone, enquiry_type, product_interest, message, ip_address) VALUES (?,?,?,?,?,?,?)",
    [b.full_name.trim().slice(0, 160), b.email.trim().slice(0, 190), String(b.phone || "").slice(0, 30) || null, b.enquiry_type,
     String(b.product_interest || "").slice(0, 100) || null, String(b.message).slice(0, 5000), req.ip]);
  const cfg = await cfgStore.load();
  await mail.send({ to: cfg.settings.notify_email || "info@tanjofoods.com", subject: `New enquiry #${r.insertId}: ${b.enquiry_type}`,
    html: `<p><b>${mail.esc(b.full_name)}</b> &lt;${mail.esc(b.email)}&gt; ${mail.esc(b.phone || "")}</p><p>Type: ${mail.esc(b.enquiry_type)}<br>Product: ${mail.esc(b.product_interest || "-")}</p><p>${mail.esc(b.message).replace(/\n/g, "<br>")}</p>` });
  res.status(201).json({ ok: true, enquiry_id: r.insertId });
}));

router.post("/notify", wrap(async (req, res) => {
  const { sku, email } = req.body || {};
  if (!EMAIL_RE.test(String(email || ""))) throw new BadRequest("Please enter a valid e-mail.");
  const [[p]] = await pool.query("SELECT product_id FROM products WHERE sku = ?", [sku]);
  if (!p) throw new BadRequest("Unknown product", 404);
  await pool.query("INSERT IGNORE INTO product_notify_requests (product_id, email) VALUES (?, ?)", [p.product_id, String(email).toLowerCase()]);
  res.status(201).json({ ok: true });
}));

/* ------------------------------------------------------------------ */
async function sendOrderEmails(orderNo) {
  try {
    const [[o]] = await pool.query("SELECT * FROM orders WHERE order_no = ?", [orderNo]);
    const [items] = await pool.query("SELECT oi.*, p.name_fr AS product_name_fr FROM order_items oi LEFT JOIN products p ON p.product_id = oi.product_id WHERE oi.order_id = ?", [o.order_id]);
    const cfg = await cfgStore.load();
    const link = `${conf.publicUrl().replace(/\/+$/, "")}/#/order/${o.order_no}?t=${o.access_token}`;
    const fr = o.lang === "fr", first = mail.esc(o.cust_name.split(" ")[0]);
    await mail.send({ to: o.cust_email, subject: fr ? `Votre commande Tanjo Foods ${o.order_no}` : `Your Tanjo Foods order ${o.order_no}`,
      html: mail.orderEmailHtml(o, items, fr ? `Merci, ${first}!` : `Thank you, ${first}!`,
        fr ? `Nous avons bien reçu votre commande. <a href="${link}">Voir votre commande</a>.` : `We've received your order. <a href="${link}">View your order</a>.`, o.lang) });
    await mail.send({ to: cfg.settings.notify_email || "info@tanjofoods.com", subject: `NEW ORDER ${o.order_no} – $${Number(o.grand_total).toFixed(2)}`,
      html: mail.orderEmailHtml(o, items, `New order ${o.order_no}`, `${mail.esc(o.cust_name)} · ${mail.esc(o.cust_phone)} · ${mail.esc(o.cust_email)}${o.customer_notes ? "<br>Notes: " + mail.esc(o.customer_notes) : ""}`) });
  } catch (e) { console.error("[mail] order e-mails failed:", e.message); }
}

module.exports = { router, BadRequest };
