// Table reservations for the dining room.
//
// Model
//   - Fixed seatings per day (e.g. Lunch 11:30, 13:00; Dinner 17:30, 19:00, 20:30), each booked separately.
//   - A booking holds one or more tables for one seating. Big groups book several tables; staff push them together.
//   - Only max_reserved_seats chairs (default 40 of 70) can be reserved per seating; the rest are for walk-ins.
//     The limit counts the CHAIRS of the booked tables (3 guests on a 4-table use 4), staff blocks included.
//   - res_booking_table has one row per held table per seating; its primary key makes double booking impossible.
//     Every booking change also locks the org's res_settings row, so two people can never both take the last seats.
//
// Statuses: C confirmed, A arrived, N no-show, X cancelled (cancelled bookings free their tables).
const crypto = require('crypto');
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');
const mailer = require('../../common/mailer');
const { FLOOR_DECOR } = require('../../common/reservation_seed');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const RES_ORG = process.env.RES_ORG_ID || process.env.SHOP_ORG_ID || 'TR';
const appUrl = () => (process.env.PUBLIC_APP_URL || 'https://pm.thanjaicaterers.com/v1').replace(/\/$/, '');

const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });
const ymd = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : moment.utc(d).format('YYYY-MM-DD')) : null);
const nowLocal = () => moment().tz(TZ);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && moment(d, 'YYYY-MM-DD', true).isValid();
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+.-]{10,20}$/;
const STATUS_LABEL = { C: 'Confirmed', A: 'Arrived', N: 'No-show', X: 'Cancelled' };
const LIVE = ['C', 'A', 'N']; // statuses that hold tables and count toward the limit
const str = (v, max) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const slotStart = (date, time) => moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TZ);
const niceDate = (d) => moment(d, 'YYYY-MM-DD').format('dddd, MMMM D, YYYY');
const niceTime = (t) => moment(t, 'HH:mm').format('h:mm A');
const sortTables = (ids, tables) => {
  const order = Object.fromEntries((tables || []).map((t) => [t.table_id, t.sort_order]));
  return [...ids].sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b));
};

// ---- simple abuse guard for the public booking form (per IP, in memory) ----
const hits = new Map();
const tooMany = (ip, limit = 6, windowMs = 15 * 60 * 1000) => {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > limit;
};

class ReservationModule extends BaseDao {
  // ---------- reading helpers ----------
  async _settings(conn, org_id, lock = false) {
    const [s] = await conn.query(`SELECT * FROM res_settings WHERE org_id = ?${lock ? ' FOR UPDATE' : ''}`, [org_id]);
    return s || null;
  }

  async _seatings(conn, org_id, activeOnly = true) {
    return conn.query(`SELECT seating_id, label, start_time, weekdays, sort_order, status FROM res_seating
                        WHERE org_id = ? ${activeOnly ? "AND status = 'A'" : ''} ORDER BY start_time, sort_order`, [org_id]);
  }

  async _tables(conn, org_id, activeOnly = true) {
    const rows = await conn.query(`SELECT table_id, table_row, seats, pos_x, pos_y, width, height, orient, online, status, sort_order
                                     FROM res_table WHERE org_id = ? ${activeOnly ? "AND status = 'A'" : ''} ORDER BY sort_order, table_id`, [org_id]);
    return rows.map((t) => ({ ...t, pos_x: Number(t.pos_x), pos_y: Number(t.pos_y), width: Number(t.width), height: Number(t.height) }));
  }

  async _closures(conn, org_id, from, to) {
    const rows = await conn.query(`SELECT closed_date, seating_id, reason FROM res_closure WHERE org_id = ? AND closed_date BETWEEN ? AND ? ORDER BY closed_date, seating_id`,
      [org_id, from, to]);
    return rows.map((c) => ({ ...c, closed_date: ymd(c.closed_date) }));
  }

  /** Seatings that run on a date (weekday rule), plus any other seating that already has bookings that day. */
  _seatingsOn(seatings, date, bookedIds = []) {
    const dow = String(moment(date, 'YYYY-MM-DD').day());
    return seatings.filter((s) => s.weekdays.includes(dow) || bookedIds.includes(s.seating_id));
  }

  _closedReason(closures, date, seating_id) {
    const c = closures.find((x) => x.closed_date === date && (x.seating_id === '' || x.seating_id === seating_id));
    return c ? (c.reason || 'Closed') : null;
  }

  _bookingOut(b, tables, seatings) {
    const seat = (seatings || []).find((s) => s.seating_id === b.seating_id);
    const ids = String(b.table_ids || '').split(',').filter(Boolean);
    return {
      booking_id: b.booking_id, booking_date: ymd(b.booking_date), seating_id: b.seating_id,
      seating_label: seat ? seat.label : '', start_time: b.start_time,
      guests: b.guests, seats: b.seats, tables: sortTables(ids, tables), kind: b.kind, source: b.source,
      customer_name: b.customer_name, phone: b.phone, email: b.email, notes: b.notes, staff_note: b.staff_note,
      status: b.status, status_label: STATUS_LABEL[b.status] || b.status,
      created_by: b.created_by, created_date: b.created_date, updated_by: b.updated_by, updated_date: b.updated_date,
      cancelled_by: b.cancelled_by, cancelled_date: b.cancelled_date, cancel_reason: b.cancel_reason,
    };
  }

  /** Bookings + per-seating figures for one date. */
  async _day(conn, org_id, date, settings) {
    const [seatingsAll, tables, closures, bookings, held] = await Promise.all([
      this._seatings(conn, org_id, false),
      this._tables(conn, org_id, false),
      this._closures(conn, org_id, date, date),
      conn.query(`SELECT * FROM res_booking WHERE org_id = ? AND booking_date = ? ORDER BY start_time, created_date`, [org_id, date]),
      conn.query(`SELECT seating_id, table_id, booking_id FROM res_booking_table WHERE org_id = ? AND booking_date = ?`, [org_id, date]),
    ]);
    const live = bookings.filter((b) => LIVE.includes(b.status));
    const seatings = this._seatingsOn(seatingsAll.filter((s) => s.status === 'A' || live.some((b) => b.seating_id === s.seating_id)),
      date, [...new Set(live.map((b) => b.seating_id))]);
    const max = settings ? settings.max_reserved_seats : 40;
    const slots = seatings.map((s) => {
      const mine = live.filter((b) => b.seating_id === s.seating_id);
      const reserved = mine.reduce((n, b) => n + b.seats, 0);
      const taken = {};
      held.filter((h) => h.seating_id === s.seating_id).forEach((h) => { taken[h.table_id] = h.booking_id; });
      return {
        seating_id: s.seating_id, label: s.label, start_time: s.start_time,
        closed: this._closedReason(closures, date, s.seating_id),
        reserved_seats: reserved, max_reserved_seats: max, seats_left: Math.max(max - reserved, 0),
        guests: mine.filter((b) => b.kind === 'C').reduce((n, b) => n + b.guests, 0),
        blocked_seats: mine.filter((b) => b.kind === 'B').reduce((n, b) => n + b.seats, 0),
        bookings: mine.filter((b) => b.kind === 'C').length,
        taken,
      };
    });
    return { seatings, seatingsAll, tables, closures, bookings, slots };
  }

  async _seq(conn, org_id) {
    await conn.query(`INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES ('RESV', ?, 0)`, [org_id]);
    await conn.query(`UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1) WHERE seq_type = 'RESV' AND branch_id = ?`, [org_id]);
    const [r] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
    return `RS${String(r.n).padStart(6, '0')}`;
  }

  // ---------- validation shared by public and staff bookings ----------
  /**
   * Checks a booking request inside the transaction (after the settings row is locked).
   * b: { booking_date, seating_id, guests, table_ids, kind }   staff: true for staff screens
   * except: booking_id being changed (its own tables / seats do not count against it)
   * Returns { error } or { seating, tables, seats }.
   */
  async _check(conn, org_id, s, b, { staff, except } = {}) {
    const date = b.booking_date;
    if (!isDate(date)) return { error: fail(400, 'Choose a date') };
    const today = nowLocal().format('YYYY-MM-DD');
    if (date < today) return { error: fail(400, 'That date has passed') };
    if (!staff && date > nowLocal().add(s.days_ahead, 'days').format('YYYY-MM-DD')) {
      return { error: fail(400, `Bookings open ${s.days_ahead} days ahead. Please choose an earlier date.`) };
    }
    const [seating] = await conn.query(`SELECT * FROM res_seating WHERE org_id = ? AND seating_id = ?`, [org_id, b.seating_id]);
    if (!seating || (seating.status !== 'A' && !staff)) return { error: fail(400, 'Choose a time') };
    if (!staff && !seating.weekdays.includes(String(moment(date, 'YYYY-MM-DD').day()))) {
      return { error: fail(400, 'We do not take bookings for this time on that day') };
    }
    const closures = await this._closures(conn, org_id, date, date);
    const closed = this._closedReason(closures, date, seating.seating_id);
    if (closed && !staff) return { error: fail(409, `Sorry, we are not taking bookings for this time (${closed}).`, { refresh: true }) };
    if (!staff) {
      if (s.booking_open !== 'Y') return { error: fail(409, `Online booking is paused right now. Please call us at ${s.phone || 'the restaurant'}.`) };
      if (slotStart(date, seating.start_time).subtract(s.min_notice_minutes, 'minutes').isBefore(nowLocal())) {
        return { error: fail(409, `Online booking for this time has closed. Please call us at ${s.phone || 'the restaurant'}.`, { refresh: true }) };
      }
    }

    const block = b.kind === 'B';
    let guests = parseInt(b.guests, 10);
    if (!block && !(guests >= 1 && guests <= 200)) return { error: fail(400, 'Choose the number of guests') };
    if (!staff && guests > s.max_party_online) {
      return { error: fail(400, `For ${guests} guests please call us at ${s.phone || 'the restaurant'} - we will arrange it.`) };
    }
    const ids = [...new Set((Array.isArray(b.table_ids) ? b.table_ids : []).map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
    if (!ids.length) return { error: fail(400, 'Choose a table') };
    if (ids.length > 12) return { error: fail(400, 'Too many tables in one booking') };
    const tables = await conn.query(`SELECT * FROM res_table WHERE org_id = ? AND table_id IN (?)`, [org_id, ids]);
    if (tables.length !== ids.length || tables.some((t) => t.status !== 'A')) return { error: fail(400, 'A chosen table is not available. Please choose again.', { refresh: true }) };
    if (!staff && tables.some((t) => t.online !== 'Y')) return { error: fail(400, 'A chosen table can only be booked by phone', { refresh: true }) };

    const seats = tables.reduce((n, t) => n + t.seats, 0);
    if (block) guests = seats; // a staff block holds every chair of its tables
    else {
      if (seats < guests) return { error: fail(400, `The chosen table(s) seat ${seats}. Add a table for ${guests} guests.`) };
      // online: no extra tables - every chosen table must be needed
      if (!staff && tables.length > 1 && seats - Math.min(...tables.map((t) => t.seats)) >= guests) {
        return { error: fail(400, `You have more tables than you need for ${guests} guests. Please remove one.`) };
      }
    }

    const busy = await conn.query(
      `SELECT table_id FROM res_booking_table WHERE org_id = ? AND booking_date = ? AND seating_id = ? AND table_id IN (?)${except ? ' AND booking_id <> ?' : ''}`,
      except ? [org_id, date, seating.seating_id, ids, except] : [org_id, date, seating.seating_id, ids]);
    if (busy.length) {
      return { error: fail(409, `Table ${busy.map((x) => x.table_id).join(', ')} was just booked by someone else. Please choose again.`, { refresh: true }) };
    }
    const [{ used }] = await conn.query(
      `SELECT COALESCE(SUM(seats), 0) AS used FROM res_booking
        WHERE org_id = ? AND booking_date = ? AND seating_id = ? AND status IN ('C','A','N')${except ? ' AND booking_id <> ?' : ''}`,
      except ? [org_id, date, seating.seating_id, except] : [org_id, date, seating.seating_id]);
    const left = s.max_reserved_seats - Number(used);
    if (seats > left) {
      const msg = left <= 0
        ? 'Sorry, this time is fully booked. Please choose another time.'
        : `Only ${left} reservable seat${left === 1 ? '' : 's'} left at this time - the chosen table(s) need ${seats}.`;
      return { error: fail(409, msg, { refresh: true }) };
    }
    return { seating, tables, seats, guests, ids: sortTables(ids, tables) };
  }

  _contact(b, { staff, kind }) {
    const name = str(b.customer_name, 150);
    const phone = str(b.phone, 30);
    const email = str(b.email, 150).toLowerCase();
    if (kind === 'B') return { customer_name: name || 'Staff block', phone: phone || null, email: email || null };
    if (!name) return { error: fail(400, 'Enter your name') };
    if (!staff || phone) {
      if (!PHONE_RE.test(phone) || phone.replace(/\D/g, '').length < 10) return { error: fail(400, 'Enter a valid phone number') };
    }
    if (!staff || email) {
      if (!EMAIL_RE.test(email)) return { error: fail(400, 'Enter a valid e-mail address') };
    }
    return { customer_name: name, phone: phone || null, email: email || null };
  }

  async _withLock(org_id, fn) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const s = await this._settings(conn, org_id, true);
      if (!s) {
        await conn.rollback();
        return fail(500, 'Reservations are not set up yet (run the database migration)');
      }
      const r = await fn(conn, s);
      if (r && r.status && r.status >= 300) await conn.rollback();
      else await conn.commit();
      return r;
    } catch (e) {
      await conn.rollback();
      if (e && e.code === 'ER_DUP_ENTRY') return fail(409, 'A chosen table was just booked by someone else. Please choose again.', { refresh: true });
      throw e;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async _insert(conn, org_id, s, chk, contact, extra) {
    const booking_id = await this._seq(conn, org_id);
    const now = new Date();
    const row = {
      org_id, booking_id, booking_date: extra.booking_date, seating_id: chk.seating.seating_id, start_time: chk.seating.start_time,
      guests: extra.kind === 'B' ? chk.seats : chk.guests, seats: chk.seats, table_ids: chk.ids.join(','),
      kind: extra.kind, source: extra.source, ...contact,
      notes: str(extra.notes, 500) || null, staff_note: str(extra.staff_note, 500) || null,
      status: 'C', manage_token: crypto.randomBytes(18).toString('hex'),
      created_by: extra.created_by, created_date: now,
    };
    await conn.query(`INSERT INTO res_booking SET ?`, [row]);
    for (const t of chk.ids) {
      await conn.query(`INSERT INTO res_booking_table (org_id, booking_date, seating_id, table_id, booking_id) VALUES (?, ?, ?, ?, ?)`,
        [org_id, row.booking_date, row.seating_id, t, booking_id]);
    }
    return row;
  }

  // ---------- e-mails ----------
  _emailHtml(s, title, intro, row, seatingLabel, opts = {}) {
    const e = mailer.escapeHtml;
    const line = (k, v) => (v ? `<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">${e(k)}</td><td style="padding:6px 0;font-weight:600">${e(v)}</td></tr>` : '');
    const tables = String(row.table_ids || '').split(',').join(' + ');
    return `<!doctype html><html><body style="margin:0;background:#f6f4f0;font-family:Arial,Helvetica,sans-serif;color:#2a2a2a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
 <div style="background:#1c1c1c;border-radius:14px 14px 0 0;padding:20px 24px;color:#fff">
  <div style="font-size:12px;letter-spacing:3px;color:#fcb12a;font-weight:bold">RESERVATION</div>
  <div style="font-size:22px;margin-top:6px;font-family:Georgia,serif">${e(title)}</div>
 </div>
 <div style="background:#fff;border:1px solid #eee;border-top:4px solid #ff8a00;border-radius:0 0 14px 14px;padding:22px 24px">
  <p style="margin:0 0 16px">${intro}</p>
  <table style="border-collapse:collapse;font-size:15px">
   ${line('Booking no.', row.booking_id)}
   ${line('Date', niceDate(ymd(row.booking_date)))}
   ${line('Time', `${niceTime(row.start_time)} (${seatingLabel})`)}
   ${line('Guests', String(row.guests))}
   ${line('Table(s)', tables)}
   ${line('Name', row.customer_name)}
   ${opts.staffCopy ? line('Phone', row.phone) : ''}
   ${opts.staffCopy ? line('E-mail', row.email) : ''}
   ${line('Request', row.notes)}
   ${opts.staffCopy ? line('Booked by', row.source === 'S' ? `Staff (${row.created_by})` : 'Website') : ''}
  </table>
  ${opts.link ? `<p style="margin:22px 0 6px"><a href="${e(opts.link)}" style="background:#ff8a00;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${e(opts.linkText)}</a></p>` : ''}
  ${opts.after ? `<p style="color:#666;font-size:13px;margin-top:16px">${opts.after}</p>` : ''}
  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="font-size:13px;color:#777;margin:0">${e(s.restaurant_name || 'Thanjai Restaurant')}${s.address ? ` · ${e(s.address)}` : ''}${s.phone ? ` · ${e(s.phone)}` : ''}</p>
 </div>
</div></body></html>`;
  }

  async _mailBooked(s, row, seatingLabel) {
    const when = `${moment(ymd(row.booking_date), 'YYYY-MM-DD').format('ddd D MMM')} ${row.start_time}`;
    const out = { customer: null, restaurant: null };
    if (row.email && row.kind === 'C') {
      out.customer = await mailer.send({
        to: row.email, replyTo: (s.notify_email || '').split(',')[0],
        subject: `Your table is booked - ${when} - ${s.restaurant_name || 'Thanjai Restaurant'}`,
        html: this._emailHtml(s, 'Your table is booked', `Hello ${mailer.escapeHtml(row.customer_name)}, thank you for booking with us. We look forward to welcoming you.`, row, seatingLabel, {
          link: `${appUrl()}/reserve/booking/${row.manage_token}`, linkText: 'View or cancel my booking',
          after: `Your table is held for about ${s.seating_minutes} minutes. If you are running late, please call us${s.phone ? ` at ${mailer.escapeHtml(s.phone)}` : ''}.`,
        }),
      });
    }
    if (s.notify_email && row.kind === 'C') {
      out.restaurant = await mailer.send({
        to: s.notify_email, replyTo: row.email || undefined,
        subject: `New reservation ${row.booking_id} - ${when} - ${row.guests} guests - ${String(row.table_ids).split(',').join('+')}`,
        html: this._emailHtml(s, `New reservation - ${row.guests} guests`, 'A new table reservation was made.', row, seatingLabel, {
          staffCopy: true, link: `${appUrl()}/reservations?date=${ymd(row.booking_date)}&seating=${row.seating_id}`, linkText: 'Open in Reservations',
        }),
      });
    }
    return out;
  }

  async _mailCancelled(s, row, seatingLabel, byCustomer) {
    const when = `${moment(ymd(row.booking_date), 'YYYY-MM-DD').format('ddd D MMM')} ${row.start_time}`;
    if (row.email && row.kind === 'C') {
      await mailer.send({
        to: row.email, replyTo: (s.notify_email || '').split(',')[0],
        subject: `Booking cancelled - ${when} - ${s.restaurant_name || 'Thanjai Restaurant'}`,
        html: this._emailHtml(s, 'Your booking is cancelled', byCustomer
          ? 'Your booking has been cancelled as you asked. We hope to see you another time.'
          : `Your booking has been cancelled by the restaurant${row.cancel_reason ? `: ${mailer.escapeHtml(row.cancel_reason)}` : ''}. Please call us if you have any questions.`,
        row, seatingLabel, { link: `${appUrl()}/reserve`, linkText: 'Book another time' }),
      });
    }
    if (s.notify_email && row.kind === 'C' && byCustomer) {
      await mailer.send({
        to: s.notify_email,
        subject: `Cancelled by customer ${row.booking_id} - ${when} - ${row.guests} guests`,
        html: this._emailHtml(s, 'Booking cancelled by the customer', 'The customer cancelled online. The table(s) are free again.', row, seatingLabel, { staffCopy: true }),
      });
    }
  }

  // ---------- public (no login) ----------
  async info() {
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, RES_ORG);
      if (!s) return fail(503, 'Reservations are not available yet');
      const today = nowLocal().format('YYYY-MM-DD');
      const last = nowLocal().add(s.days_ahead, 'days').format('YYYY-MM-DD');
      const [seatings, tables, closures] = await Promise.all([
        this._seatings(conn, RES_ORG), this._tables(conn, RES_ORG), this._closures(conn, RES_ORG, today, last),
      ]);
      return ok({
        restaurant: {
          name: s.restaurant_name, phone: s.phone, address: s.address, booking_open: s.booking_open,
          max_party_online: s.max_party_online, days_ahead: s.days_ahead, seating_minutes: s.seating_minutes,
          min_notice_minutes: s.min_notice_minutes, cancel_notice_minutes: s.cancel_notice_minutes,
          guest_notes: String(s.guest_notes || '').split('\n').map((x) => x.trim()).filter(Boolean),
        },
        today, last_date: last,
        seatings: seatings.map(({ status, ...x }) => x),
        tables: tables.filter((t) => t.online === 'Y').map(({ status, online, ...t }) => t),
        decor: FLOOR_DECOR,
        closed_days: closures.filter((c) => c.seating_id === '').map((c) => ({ date: c.closed_date, reason: c.reason })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Free tables and seats left for every seating of a date (no names). */
  async availability(date) {
    if (!isDate(date)) return fail(400, 'Choose a date');
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, RES_ORG);
      if (!s) return fail(503, 'Reservations are not available yet');
      const now = nowLocal();
      const tooFar = date > now.clone().add(s.days_ahead, 'days').format('YYYY-MM-DD');
      const d = await this._day(conn, RES_ORG, date, s);
      const onlineTables = new Set(d.tables.filter((t) => t.status === 'A' && t.online === 'Y').map((t) => t.table_id));
      const slots = d.slots.filter((x) => d.seatingsAll.find((z) => z.seating_id === x.seating_id && z.status === 'A'))
        .map((x) => {
          let state = 'open';
          let reason = null;
          if (s.booking_open !== 'Y') { state = 'closed'; reason = 'Online booking paused'; }
          else if (date < now.format('YYYY-MM-DD') || tooFar) { state = 'closed'; reason = tooFar ? 'Not open for booking yet' : 'Past'; }
          else if (x.closed) { state = 'closed'; reason = x.closed; }
          else if (slotStart(date, x.start_time).subtract(s.min_notice_minutes, 'minutes').isBefore(now)) { state = 'past'; reason = 'Booking closed'; }
          else if (x.seats_left <= 0) { state = 'full'; reason = 'Fully booked'; }
          return {
            seating_id: x.seating_id, label: x.label, start_time: x.start_time, state, reason,
            seats_left: x.seats_left, taken: Object.keys(x.taken).filter((t) => onlineTables.has(t)),
          };
        });
      return ok({ date, seatings: slots });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async book(b, ip) {
    b = b || {};
    if (b.website) return fail(400, 'Please try again'); // hidden field: only bots fill it in
    if (ip && tooMany(ip)) return fail(429, 'Too many booking attempts. Please wait a few minutes or call us.');
    const contact = this._contact(b, { staff: false, kind: 'C' });
    if (contact.error) return contact.error;
    let mailInfo = null;
    const r = await this._withLock(RES_ORG, async (conn, s) => {
      const chk = await this._check(conn, RES_ORG, s, { ...b, kind: 'C' }, { staff: false });
      if (chk.error) return chk.error;
      const dup = await conn.query(
        `SELECT booking_id FROM res_booking WHERE org_id = ? AND booking_date = ? AND seating_id = ? AND status IN ('C','A','N') AND kind = 'C'
            AND (email = ? OR REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')','') = ?) LIMIT 1`,
        [RES_ORG, b.booking_date, chk.seating.seating_id, contact.email, String(contact.phone).replace(/[\s()-]/g, '')]);
      if (dup.length) {
        return fail(409, `You already have a booking for this time (${dup[0].booking_id}). To change it, cancel it from the link in your e-mail and book again, or call us.`);
      }
      const row = await this._insert(conn, RES_ORG, s, chk, contact, {
        booking_date: b.booking_date, kind: 'C', source: 'W', notes: b.notes, created_by: 'website',
      });
      mailInfo = { s, row, label: chk.seating.label };
      return ok({ booking: { ...this._bookingOut(row, chk.tables, [chk.seating]), manage_token: row.manage_token } });
    });
    if (mailInfo) {
      const m = await this._mailBooked(mailInfo.s, mailInfo.row, mailInfo.label);
      r.email_sent = !!(m.customer && m.customer.sent);
    }
    return r;
  }

  async getByToken(token) {
    if (!/^[a-f0-9]{24,48}$/.test(token || '')) return fail(404, 'Booking not found');
    const conn = await this.getReadConnection();
    try {
      const [b] = await conn.query(`SELECT * FROM res_booking WHERE manage_token = ?`, [token]);
      if (!b || b.org_id !== RES_ORG) return fail(404, 'Booking not found');
      const s = await this._settings(conn, RES_ORG);
      const [seatings, tables] = await Promise.all([this._seatings(conn, RES_ORG, false), this._tables(conn, RES_ORG, false)]);
      const out = this._bookingOut(b, tables, seatings);
      const deadline = slotStart(out.booking_date, out.start_time).subtract(s.cancel_notice_minutes, 'minutes');
      const { staff_note, created_by, updated_by, cancelled_by, ...pub } = out;
      return ok({
        booking: pub,
        can_cancel: b.status === 'C' && deadline.isAfter(nowLocal()),
        cancel_until: deadline.format('YYYY-MM-DD HH:mm'),
        restaurant: { name: s.restaurant_name, phone: s.phone, address: s.address, seating_minutes: s.seating_minutes },
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async cancelByToken(token) {
    if (!/^[a-f0-9]{24,48}$/.test(token || '')) return fail(404, 'Booking not found');
    let mailInfo = null;
    const r = await this._withLock(RES_ORG, async (conn, s) => {
      const [b] = await conn.query(`SELECT * FROM res_booking WHERE manage_token = ? FOR UPDATE`, [token]);
      if (!b || b.org_id !== RES_ORG) return fail(404, 'Booking not found');
      if (b.status === 'X') return fail(409, 'This booking is already cancelled');
      if (b.status !== 'C') return fail(409, 'This booking can no longer be changed online. Please call us.');
      const deadline = slotStart(ymd(b.booking_date), b.start_time).subtract(s.cancel_notice_minutes, 'minutes');
      if (deadline.isBefore(nowLocal())) return fail(409, `It is too late to cancel online. Please call us${s.phone ? ` at ${s.phone}` : ''}.`);
      const now = new Date();
      await conn.query(`UPDATE res_booking SET status = 'X', cancelled_by = 'customer', cancelled_date = ?, cancel_reason = 'Cancelled online by the customer'
                         WHERE org_id = ? AND booking_id = ?`, [now, b.org_id, b.booking_id]);
      await conn.query(`DELETE FROM res_booking_table WHERE org_id = ? AND booking_id = ?`, [b.org_id, b.booking_id]);
      const [seat] = await conn.query(`SELECT label FROM res_seating WHERE org_id = ? AND seating_id = ?`, [b.org_id, b.seating_id]);
      mailInfo = { s, row: { ...b, status: 'X' }, label: seat ? seat.label : '' };
      return ok({ message: 'Your booking is cancelled' });
    });
    if (mailInfo) await this._mailCancelled(mailInfo.s, mailInfo.row, mailInfo.label, true);
    return r;
  }

  // ---------- staff ----------
  /** Everything for one date: seatings with figures, tables, bookings (used by the floor screen and the reports). */
  async day(org_id, date) {
    if (!isDate(date)) return fail(400, 'Choose a date');
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, org_id);
      if (!s) return fail(503, 'Reservations are not set up yet (run the database migration)');
      const d = await this._day(conn, org_id, date, s);
      return ok({
        date, settings: { max_reserved_seats: s.max_reserved_seats, restaurant_name: s.restaurant_name, phone: s.phone, booking_open: s.booking_open },
        seatings: d.slots,
        tables: d.tables,
        decor: FLOOR_DECOR,
        closures: d.closures,
        bookings: d.bookings.map((b) => this._bookingOut(b, d.tables, d.seatingsAll)),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Staff booking (phone / walk-up) or a staff block. b.kind: C customer (default) or B block. */
  async staffCreate(user, b) {
    b = b || {};
    const kind = b.kind === 'B' ? 'B' : 'C';
    const contact = this._contact(b, { staff: true, kind });
    if (contact.error) return contact.error;
    let mailInfo = null;
    const r = await this._withLock(user.org_id, async (conn, s) => {
      const chk = await this._check(conn, user.org_id, s, { ...b, kind }, { staff: true });
      if (chk.error) return chk.error;
      const row = await this._insert(conn, user.org_id, s, chk, contact, {
        booking_date: b.booking_date, kind, source: 'S', notes: b.notes, staff_note: b.staff_note, created_by: user.user_id,
      });
      if (kind === 'C' && b.send_email !== false && (row.email || s.notify_email)) mailInfo = { s, row, label: chk.seating.label };
      return ok({ message: kind === 'B' ? `Blocked ${chk.ids.join(' + ')}` : `Booked ${row.booking_id}`, booking: this._bookingOut(row, chk.tables, [chk.seating]) });
    });
    if (mailInfo) await this._mailBooked(mailInfo.s, mailInfo.row, mailInfo.label);
    return r;
  }

  /** Change a booking: date, seating, guests, tables and/or contact details. */
  async staffUpdate(user, b) {
    b = b || {};
    return this._withLock(user.org_id, async (conn, s) => {
      const [cur] = await conn.query(`SELECT * FROM res_booking WHERE org_id = ? AND booking_id = ? FOR UPDATE`, [user.org_id, b.booking_id]);
      if (!cur) return fail(404, 'Booking not found');
      if (cur.status === 'X') return fail(409, 'This booking is cancelled');
      const merged = {
        booking_date: b.booking_date || ymd(cur.booking_date), seating_id: b.seating_id || cur.seating_id,
        guests: b.guests !== undefined ? b.guests : cur.guests,
        table_ids: Array.isArray(b.table_ids) ? b.table_ids : cur.table_ids.split(','), kind: cur.kind,
      };
      const contact = this._contact({
        customer_name: b.customer_name !== undefined ? b.customer_name : cur.customer_name,
        phone: b.phone !== undefined ? b.phone : cur.phone, email: b.email !== undefined ? b.email : cur.email,
      }, { staff: true, kind: cur.kind });
      if (contact.error) return contact.error;
      const chk = await this._check(conn, user.org_id, s, merged, { staff: true, except: cur.booking_id });
      if (chk.error) return chk.error;
      const upd = {
        booking_date: merged.booking_date, seating_id: chk.seating.seating_id, start_time: chk.seating.start_time,
        guests: cur.kind === 'B' ? chk.seats : chk.guests, seats: chk.seats, table_ids: chk.ids.join(','), ...contact,
        notes: b.notes !== undefined ? str(b.notes, 500) || null : cur.notes,
        staff_note: b.staff_note !== undefined ? str(b.staff_note, 500) || null : cur.staff_note,
        updated_by: user.user_id, updated_date: new Date(),
      };
      await conn.query(`UPDATE res_booking SET ? WHERE org_id = ? AND booking_id = ?`, [upd, user.org_id, cur.booking_id]);
      await conn.query(`DELETE FROM res_booking_table WHERE org_id = ? AND booking_id = ?`, [user.org_id, cur.booking_id]);
      for (const t of chk.ids) {
        await conn.query(`INSERT INTO res_booking_table (org_id, booking_date, seating_id, table_id, booking_id) VALUES (?, ?, ?, ?, ?)`,
          [user.org_id, upd.booking_date, upd.seating_id, t, cur.booking_id]);
      }
      return ok({ message: `${cur.booking_id} updated`, booking: this._bookingOut({ ...cur, ...upd }, chk.tables, [chk.seating]) });
    });
  }

  /** Arrived (A), no-show (N), back to confirmed (C, from A/N), cancel (X; frees the tables). */
  async setStatus(user, b) {
    b = b || {};
    const status = b.status;
    if (!['A', 'N', 'C', 'X'].includes(status)) return fail(400, 'Unknown status');
    let mailInfo = null;
    const r = await this._withLock(user.org_id, async (conn, s) => {
      const [cur] = await conn.query(`SELECT * FROM res_booking WHERE org_id = ? AND booking_id = ? FOR UPDATE`, [user.org_id, b.booking_id]);
      if (!cur) return fail(404, 'Booking not found');
      if (cur.status === 'X') return fail(409, 'This booking is already cancelled');
      const now = new Date();
      if (status === 'X') {
        const reason = str(b.reason, 200) || null;
        await conn.query(`UPDATE res_booking SET status = 'X', cancelled_by = ?, cancelled_date = ?, cancel_reason = ? WHERE org_id = ? AND booking_id = ?`,
          [user.user_id, now, reason, user.org_id, cur.booking_id]);
        await conn.query(`DELETE FROM res_booking_table WHERE org_id = ? AND booking_id = ?`, [user.org_id, cur.booking_id]);
        if (b.notify && cur.email) {
          const [seat] = await conn.query(`SELECT label FROM res_seating WHERE org_id = ? AND seating_id = ?`, [user.org_id, cur.seating_id]);
          mailInfo = { s, row: { ...cur, status: 'X', cancel_reason: reason }, label: seat ? seat.label : '' };
        }
        return ok({ message: cur.kind === 'B' ? 'Block removed - tables are free' : `${cur.booking_id} cancelled - tables are free` });
      }
      await conn.query(`UPDATE res_booking SET status = ?, updated_by = ?, updated_date = ? WHERE org_id = ? AND booking_id = ?`,
        [status, user.user_id, now, user.org_id, cur.booking_id]);
      return ok({ message: `${cur.booking_id}: ${STATUS_LABEL[status]}` });
    });
    if (mailInfo) await this._mailCancelled(mailInfo.s, mailInfo.row, mailInfo.label, false);
    return r;
  }

  /** Bookings by customer name / phone / e-mail / booking no. (upcoming first). */
  async search(org_id, q) {
    const term = str(q, 60);
    if (term.length < 2) return ok({ bookings: [] });
    const conn = await this.getReadConnection();
    try {
      const like = `%${term}%`;
      const rows = await conn.query(
        `SELECT * FROM res_booking WHERE org_id = ? AND (booking_id LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR email LIKE ?)
          ORDER BY booking_date DESC, start_time LIMIT 50`, [org_id, like, like, like, like]);
      const [seatings, tables] = await Promise.all([this._seatings(conn, org_id, false), this._tables(conn, org_id, false)]);
      return ok({ bookings: rows.map((b) => this._bookingOut(b, tables, seatings)) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- setup ----------
  async getSetup(org_id) {
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, org_id);
      if (!s) return fail(503, 'Reservations are not set up yet (run the database migration)');
      const today = nowLocal().format('YYYY-MM-DD');
      const [seatings, tables, closures] = await Promise.all([
        this._seatings(conn, org_id, false), this._tables(conn, org_id, false),
        this._closures(conn, org_id, today, nowLocal().add(2, 'years').format('YYYY-MM-DD')),
      ]);
      return ok({ settings: s, seatings, tables, closures, decor: FLOOR_DECOR, mail_configured: mailer.configured(), public_url: `${appUrl()}/reserve` });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async saveSettings(user, b) {
    b = b || {};
    const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };
    const emails = String(b.notify_email || '').split(/[,;\s]+/).filter(Boolean);
    if (emails.some((e) => !EMAIL_RE.test(e))) return fail(400, 'Restaurant e-mail: enter valid address(es), separated by commas');
    const v = {
      max_reserved_seats: int(b.max_reserved_seats, 1, 500, 40),
      days_ahead: int(b.days_ahead, 1, 365, 30),
      min_notice_minutes: int(b.min_notice_minutes, 0, 2880, 60),
      cancel_notice_minutes: int(b.cancel_notice_minutes, 0, 2880, 60),
      max_party_online: int(b.max_party_online, 1, 100, 12),
      seating_minutes: int(b.seating_minutes, 15, 600, 90),
      booking_open: b.booking_open === 'N' ? 'N' : 'Y',
      restaurant_name: str(b.restaurant_name, 100) || null,
      phone: str(b.phone, 30) || null,
      address: str(b.address, 300) || null,
      notify_email: emails.join(', ') || null,
      guest_notes: String(b.guest_notes || '').slice(0, 3000) || null,
      updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`INSERT INTO res_settings SET ? ON DUPLICATE KEY UPDATE ?`, [{ org_id: user.org_id, ...v }, v]);
      return ok({ message: 'Settings saved' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async saveSeating(user, b) {
    b = b || {};
    const label = str(b.label, 50);
    if (!label) return fail(400, 'Enter a name, e.g. Lunch or Dinner');
    if (!isTime(b.start_time)) return fail(400, 'Enter the start time as HH:MM (24-hour), e.g. 19:00');
    const weekdays = [...new Set(String(b.weekdays || '').replace(/[^0-6]/g, '').split(''))].sort().join('');
    if (!weekdays) return fail(400, 'Tick at least one day');
    const conn = await this.getWriteConnection();
    try {
      let id = str(b.seating_id, 20).toUpperCase().replace(/[^A-Z0-9_]/g, '');
      if (!id) {
        const rows = await conn.query(`SELECT seating_id FROM res_seating WHERE org_id = ?`, [user.org_id]);
        let n = rows.length + 1;
        while (rows.some((r) => r.seating_id === `S${n}`)) n++;
        id = `S${n}`;
      }
      const dupe = await conn.query(`SELECT seating_id FROM res_seating WHERE org_id = ? AND start_time = ? AND seating_id <> ? AND status = 'A'`, [user.org_id, b.start_time, id]);
      if (dupe.length && b.status !== 'I') return fail(409, `There is already a seating at ${b.start_time}`);
      const v = { label, start_time: b.start_time, weekdays, sort_order: parseInt(b.sort_order, 10) || 0, status: b.status === 'I' ? 'I' : 'A', updated_by: user.user_id, updated_date: new Date() };
      const [existing] = await conn.query(`SELECT start_time FROM res_seating WHERE org_id = ? AND seating_id = ?`, [user.org_id, id]);
      if (existing && existing.start_time !== v.start_time) {
        // future bookings keep the time they were made for; tell staff so they can contact guests
        const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM res_booking WHERE org_id = ? AND seating_id = ? AND booking_date >= ? AND status = 'C'`,
          [user.org_id, id, nowLocal().format('YYYY-MM-DD')]);
        if (n && !b.confirm) return fail(409, `${n} upcoming booking(s) were made for ${existing.start_time}. Save again to confirm; their guests keep the old time unless you contact them.`, { needs_confirm: true });
      }
      await conn.query(`INSERT INTO res_seating SET ? ON DUPLICATE KEY UPDATE ?`, [{ org_id: user.org_id, seating_id: id, ...v }, v]);
      if (existing && existing.start_time !== v.start_time) {
        await conn.query(`UPDATE res_booking SET start_time = ? WHERE org_id = ? AND seating_id = ? AND booking_date >= ? AND status IN ('C','A','N')`,
          [v.start_time, user.org_id, id, nowLocal().format('YYYY-MM-DD')]);
      }
      return ok({ message: 'Seating saved', seating_id: id });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async saveTable(user, b) {
    b = b || {};
    const id = str(b.table_id, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!id) return fail(400, 'Enter a table number, e.g. A7');
    const seats = parseInt(b.seats, 10);
    if (!(seats >= 1 && seats <= 30)) return fail(400, 'Chairs must be between 1 and 30');
    const num = (v, d, lo = 0, hi = 100) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };
    const v = {
      table_row: str(b.table_row, 10) || id.replace(/\d+$/, '') || null, seats,
      pos_x: num(b.pos_x, 50), pos_y: num(b.pos_y, 50), width: num(b.width, 7, 2, 40), height: num(b.height, 6, 2, 40),
      orient: b.orient === 'V' ? 'V' : 'H', online: b.online === 'N' ? 'N' : 'Y', status: b.status === 'I' ? 'I' : 'A',
      sort_order: parseInt(b.sort_order, 10) || 0, updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      if (v.status === 'I') {
        const rows = await conn.query(`SELECT b.booking_id, b.booking_date FROM res_booking_table t JOIN res_booking b ON b.org_id = t.org_id AND b.booking_id = t.booking_id
                                        WHERE t.org_id = ? AND t.table_id = ? AND t.booking_date >= ? ORDER BY t.booking_date LIMIT 5`,
          [user.org_id, id, nowLocal().format('YYYY-MM-DD')]);
        if (rows.length) return fail(409, `Table ${id} has upcoming bookings (${rows.map((r) => r.booking_id).join(', ')}). Move them to other tables first.`);
      }
      await conn.query(`INSERT INTO res_table SET ? ON DUPLICATE KEY UPDATE ?`, [{ org_id: user.org_id, table_id: id, ...v }, v]);
      return ok({ message: `Table ${id} saved` });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async saveClosure(user, b) {
    b = b || {};
    if (!isDate(b.closed_date)) return fail(400, 'Choose a date');
    const seating_id = str(b.seating_id, 20);
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`INSERT INTO res_closure SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason)`, [{
        org_id: user.org_id, closed_date: b.closed_date, seating_id, reason: str(b.reason, 200) || null, created_by: user.user_id, created_date: new Date(),
      }]);
      const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM res_booking WHERE org_id = ? AND booking_date = ? ${seating_id ? 'AND seating_id = ?' : ''} AND status = 'C'`,
        seating_id ? [user.org_id, b.closed_date, seating_id] : [user.org_id, b.closed_date]);
      return ok({ message: n ? `Closed for online booking. ${n} existing booking(s) are NOT cancelled - check them in Reservations.` : 'Closed for online booking' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async deleteClosure(user, b) {
    b = b || {};
    if (!isDate(b.closed_date)) return fail(400, 'Choose a date');
    const conn = await this.getWriteConnection();
    try {
      await conn.query(`DELETE FROM res_closure WHERE org_id = ? AND closed_date = ? AND seating_id = ?`, [user.org_id, b.closed_date, str(b.seating_id, 20)]);
      return ok({ message: 'Open again' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }
}

const reservationModule = new ReservationModule();
module.exports = { reservationModule, STATUS_LABEL, _test: { hits } };
