// Table reservations for the dining room.
//
// Model
//   - Sessions (Lunch 11:00-14:30, Dinner 17:00-21:30 by default) offer a start time every interval_min (30) minutes.
//   - A booking holds its tables for duration_min minutes (the "table time", default 90) from its start time.
//     res_booking_slot has one row per held table per 15-minute step; its primary key makes overlapping double
//     bookings impossible. Every booking change also locks the org's res_settings row.
//   - Only max_reserved_seats chairs (default 40) may be reserved at any moment; the rest are for walk-ins. A booking
//     counts the CHAIRS of its tables (3 guests on a 4-table use 4) - staff blocks included - for every 15 minutes it
//     holds them. A booking without tables (staff will allocate) counts its guests until tables are allocated.
//   - Tables with joinable = 'N' (the A booths) can only be booked on their own, so bigger groups get B / C tables.
//     When no tables fit a group online, the guest can still book the time; staff allocate the tables and the guest
//     is e-mailed the table numbers.
//
// Statuses: C confirmed, A arrived, N no-show, X cancelled (cancelled bookings free their tables).
const crypto = require('crypto');
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');
const mailer = require('../../common/mailer');
const { FLOOR_DECOR } = require('../../common/reservation_seed');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const RES_ORG = process.env.RES_ORG_ID || process.env.SHOP_ORG_ID || 'TR';
const STEP = 15; // minutes per occupancy step
const appUrl = () => (process.env.PUBLIC_APP_URL || 'https://pm.thanjaicaterers.com/v1').replace(/\/$/, '');

const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });
const ymd = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : moment.utc(d).format('YYYY-MM-DD')) : null);
const nowLocal = () => moment().tz(TZ);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && moment(d, 'YYYY-MM-DD', true).isValid();
const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+.-]{10,20}$/;
const STATUS_LABEL = { C: 'Confirmed', A: 'Arrived', N: 'No-show', X: 'Cancelled' };
const LIVE = ['C', 'A', 'N']; // statuses that hold tables and count toward the limit
const str = (v, max) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const slotStart = (date, time) => moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TZ);
const niceDate = (d) => moment(d, 'YYYY-MM-DD').format('dddd, MMMM D, YYYY');
const niceTime = (t) => moment(t, 'HH:mm').format('h:mm A');
const tableList = (ids) => String(ids || '').split(',').filter(Boolean);
const sortTables = (ids, tables) => {
  const order = Object.fromEntries((tables || []).map((t) => [t.table_id, t.sort_order]));
  return [...ids].sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b));
};

/** 15-minute steps a booking covers: ['19:00','19:15',...] */
const steps = (start, duration) => { const out = []; for (let m = toMin(start); m < toMin(start) + duration; m += STEP) out.push(hhmm(m)); return out; };
/** Start times a session offers. */
const slotsOf = (s) => {
  const out = [];
  const end = toMin(s.end_time || s.start_time);
  const every = Math.max(parseInt(s.interval_min, 10) || 30, 5);
  for (let m = toMin(s.start_time); m <= end; m += every) out.push(hhmm(m));
  return out;
};

// Same rule as the booking page: enough chairs, within the seats left, no spare table, tables that cannot be joined
// only on their own; prefers fewest spare chairs, then fewest tables, then one row.
const isMinimal = (list, guests) => list.length <= 1 || list.reduce((n, t) => n + t.seats, 0) - Math.min(...list.map((t) => t.seats)) < guests;
const bestTables = (free, guests, seatsLeft, maxTables = 4) => {
  const list = [...free].sort((a, b) => a.sort_order - b.sort_order);
  let best = null;
  let bestScore = null;
  const walk = (start, combo, chairs) => {
    if (chairs >= guests) {
      if (chairs <= seatsLeft && isMinimal(combo, guests) && (combo.length === 1 || combo.every((t) => t.joinable !== 'N'))) {
        const score = [chairs - guests, combo.length, new Set(combo.map((t) => t.table_row)).size];
        const better = !bestScore || (() => { for (let i = 0; i < score.length; i++) if (score[i] !== bestScore[i]) return score[i] < bestScore[i]; return false; })();
        if (better) { best = [...combo]; bestScore = score; }
      }
      return;
    }
    if (combo.length >= maxTables) return;
    for (let i = start; i < list.length; i++) {
      if (chairs + list[i].seats > seatsLeft) continue;
      if (combo.length && (list[i].joinable === 'N' || combo.some((t) => t.joinable === 'N'))) continue;
      combo.push(list[i]);
      walk(i + 1, combo, chairs + list[i].seats);
      combo.pop();
    }
  };
  walk(0, [], 0);
  return best;
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

  async _sessions(conn, org_id, activeOnly = true) {
    return conn.query(`SELECT seating_id, label, start_time, end_time, interval_min, weekdays, sort_order, status FROM res_seating
                        WHERE org_id = ? ${activeOnly ? "AND status = 'A'" : ''} ORDER BY start_time, sort_order`, [org_id]);
  }

  async _tables(conn, org_id, activeOnly = true) {
    const rows = await conn.query(`SELECT table_id, table_row, seats, pos_x, pos_y, width, height, orient, online, joinable, status, sort_order
                                     FROM res_table WHERE org_id = ? ${activeOnly ? "AND status = 'A'" : ''} ORDER BY sort_order, table_id`, [org_id]);
    return rows.map((t) => ({ ...t, pos_x: Number(t.pos_x), pos_y: Number(t.pos_y), width: Number(t.width), height: Number(t.height) }));
  }

  async _closures(conn, org_id, from, to) {
    const rows = await conn.query(`SELECT closed_date, seating_id, reason FROM res_closure WHERE org_id = ? AND closed_date BETWEEN ? AND ? ORDER BY closed_date, seating_id`,
      [org_id, from, to]);
    return rows.map((c) => ({ ...c, closed_date: ymd(c.closed_date) }));
  }

  _runsOn(session, date) { return session.weekdays.includes(String(moment(date, 'YYYY-MM-DD').day())); }

  _closedReason(closures, date, seating_id) {
    const c = closures.find((x) => x.closed_date === date && (x.seating_id === '' || x.seating_id === seating_id));
    return c ? (c.reason || 'Closed') : null;
  }

  _bookingOut(b, tables, sessions) {
    const sess = (sessions || []).find((s) => s.seating_id === b.seating_id);
    const duration = b.duration_min || 90;
    return {
      booking_id: b.booking_id, booking_date: ymd(b.booking_date), seating_id: b.seating_id,
      seating_label: sess ? sess.label : '', start_time: b.start_time, duration_min: duration, end_time: hhmm(toMin(b.start_time) + duration),
      guests: b.guests, seats: b.seats, tables: sortTables(tableList(b.table_ids), tables), needs_tables: !tableList(b.table_ids).length,
      kind: b.kind, source: b.source,
      customer_name: b.customer_name, phone: b.phone, email: b.email, notes: b.notes, staff_note: b.staff_note,
      status: b.status, status_label: STATUS_LABEL[b.status] || b.status,
      created_by: b.created_by, created_date: b.created_date, updated_by: b.updated_by, updated_date: b.updated_date,
      cancelled_by: b.cancelled_by, cancelled_date: b.cancelled_date, cancel_reason: b.cancel_reason,
    };
  }

  /** Chairs reserved per 15-minute step for a date. live: bookings that hold seats. */
  _usage(live, except) {
    const used = {};
    live.filter((b) => b.booking_id !== except).forEach((b) => steps(b.start_time, b.duration_min || 90).forEach((t) => { used[t] = (used[t] || 0) + b.seats; }));
    return used;
  }

  /** Bookings, sessions with their start times and figures for one date. */
  async _day(conn, org_id, date, s) {
    const [sessionsAll, tables, closures, bookings, held] = await Promise.all([
      this._sessions(conn, org_id, false),
      this._tables(conn, org_id, false),
      this._closures(conn, org_id, date, date),
      conn.query(`SELECT * FROM res_booking WHERE org_id = ? AND booking_date = ? ORDER BY start_time, created_date`, [org_id, date]),
      conn.query(`SELECT slot_time, table_id, booking_id FROM res_booking_slot WHERE org_id = ? AND booking_date = ?`, [org_id, date]),
    ]);
    const live = bookings.filter((b) => LIVE.includes(b.status));
    const max = s ? s.max_reserved_seats : 40;
    const dur = s ? s.seating_minutes : 90;
    const used = this._usage(live);
    const heldAt = {}; // slot_time -> { table_id: booking_id }
    held.forEach((h) => { (heldAt[h.slot_time] = heldAt[h.slot_time] || {})[h.table_id] = h.booking_id; });
    const sessions = sessionsAll.filter((x) => (x.status === 'A' && this._runsOn(x, date)) || live.some((b) => b.seating_id === x.seating_id));
    const out = sessions.map((x) => {
      const slots = slotsOf(x).map((time) => {
        const window = steps(time, dur);
        const peak = Math.max(0, ...window.map((t) => used[t] || 0));
        const busy = {};
        window.forEach((t) => Object.assign(busy, heldAt[t] || {}));
        const starting = live.filter((b) => b.start_time === time);
        return {
          time, reserved_seats: used[time] || 0, peak_seats: peak, seats_left: Math.max(max - peak, 0),
          at: { ...(heldAt[time] || {}) }, // tables in use at this time
          busy, // tables not free for a booking starting now (held at some point in the table time)
          bookings: starting.filter((b) => b.kind === 'C').length,
          guests: starting.filter((b) => b.kind === 'C').reduce((n, b) => n + b.guests, 0),
        };
      });
      const mine = live.filter((b) => b.seating_id === x.seating_id);
      return {
        seating_id: x.seating_id, label: x.label, start_time: x.start_time, end_time: x.end_time || x.start_time, interval_min: x.interval_min,
        closed: this._closedReason(closures, date, x.seating_id), max_reserved_seats: max,
        bookings: mine.filter((b) => b.kind === 'C').length,
        guests: mine.filter((b) => b.kind === 'C').reduce((n, b) => n + b.guests, 0),
        blocked_seats: mine.filter((b) => b.kind === 'B').reduce((n, b) => n + b.seats, 0),
        to_allocate: mine.filter((b) => !tableList(b.table_ids).length).length,
        peak_seats: Math.max(0, ...slots.map((z) => z.reserved_seats)),
        slots,
      };
    });
    return { sessions: out, sessionsAll, tables, closures, bookings, live, used, heldAt, max, dur };
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
   * b: { booking_date, seating_id, start_time, guests, table_ids, kind, duration_min? }
   * staff: true from staff screens. except: booking being changed (its own tables / seats do not count against it).
   * Returns { error } or { session, tables, seats, guests, ids, duration }.
   */
  async _check(conn, org_id, s, b, { staff, except } = {}) {
    const date = b.booking_date;
    if (!isDate(date)) return { error: fail(400, 'Choose a date') };
    const today = nowLocal().format('YYYY-MM-DD');
    if (date < today) return { error: fail(400, 'That date has passed') };
    if (!staff && date > nowLocal().add(s.days_ahead, 'days').format('YYYY-MM-DD')) {
      return { error: fail(400, `Bookings open ${s.days_ahead} days ahead. Please choose an earlier date.`) };
    }
    const [session] = await conn.query(`SELECT * FROM res_seating WHERE org_id = ? AND seating_id = ?`, [org_id, b.seating_id]);
    if (!session || (session.status !== 'A' && !staff)) return { error: fail(400, 'Choose a time') };
    const start = b.start_time;
    if (!isTime(start) || (!staff && !slotsOf(session).includes(start))) return { error: fail(400, 'Choose a time') };
    if (!staff && !this._runsOn(session, date)) return { error: fail(400, 'We do not take bookings for this time on that day') };
    const closures = await this._closures(conn, org_id, date, date);
    const closed = this._closedReason(closures, date, session.seating_id);
    if (closed && !staff) return { error: fail(409, `Sorry, we are not taking bookings for this time (${closed}).`, { refresh: true }) };
    if (!staff) {
      if (s.booking_open !== 'Y') return { error: fail(409, `Online booking is paused right now. Please call us at ${s.phone || 'the restaurant'}.`) };
      if (slotStart(date, start).subtract(s.min_notice_minutes, 'minutes').isBefore(nowLocal())) {
        return { error: fail(409, `Online booking for this time has closed. Please call us at ${s.phone || 'the restaurant'}.`, { refresh: true }) };
      }
    }
    const duration = staff && parseInt(b.duration_min, 10) >= 15 ? Math.min(parseInt(b.duration_min, 10), 600) : s.seating_minutes;
    const window = steps(start, duration);

    const block = b.kind === 'B';
    let guests = parseInt(b.guests, 10);
    if (!block && !(guests >= 1 && guests <= 200)) return { error: fail(400, 'Choose the number of guests') };
    if (!staff && guests > s.max_party_online) {
      return { error: fail(400, `For ${guests} guests please call us at ${s.phone || 'the restaurant'} - we will arrange it.`) };
    }
    const ids = [...new Set((Array.isArray(b.table_ids) ? b.table_ids : []).map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
    if (block && !ids.length) return { error: fail(400, 'Choose the tables to block') };
    if (ids.length > 12) return { error: fail(400, 'Too many tables in one booking') };
    let tables = [];
    if (ids.length) {
      tables = await conn.query(`SELECT * FROM res_table WHERE org_id = ? AND table_id IN (?)`, [org_id, ids]);
      if (tables.length !== ids.length || tables.some((t) => t.status !== 'A')) return { error: fail(400, 'A chosen table is not available. Please choose again.', { refresh: true }) };
      if (!staff && tables.some((t) => t.online !== 'Y')) return { error: fail(400, 'A chosen table can only be booked by phone', { refresh: true }) };
      if (tables.length > 1) {
        const solo = tables.filter((t) => t.joinable === 'N').map((t) => t.table_id);
        if (solo.length) return { error: fail(400, `Table ${solo.join(', ')} cannot be joined with other tables. Choose ${solo.length > 1 ? 'them' : 'it'} on ${solo.length > 1 ? 'their' : 'its'} own or other tables.`) };
      }
    }
    const chairs = tables.reduce((n, t) => n + t.seats, 0);
    if (block) guests = chairs; // a staff block holds every chair of its tables
    else if (ids.length) {
      if (chairs < guests) return { error: fail(400, `The chosen table(s) seat ${chairs}. Add a table for ${guests} guests.`) };
      if (!staff && !isMinimal(tables, guests)) return { error: fail(400, `You have more tables than you need for ${guests} guests. Please remove one.`) };
    }
    const seats = ids.length ? chairs : guests; // no tables yet: the guests count until staff allocate

    if (ids.length) {
      const busy = await conn.query(
        `SELECT DISTINCT table_id FROM res_booking_slot WHERE org_id = ? AND booking_date = ? AND slot_time IN (?) AND table_id IN (?)${except ? ' AND booking_id <> ?' : ''}`,
        except ? [org_id, date, window, ids, except] : [org_id, date, window, ids]);
      if (busy.length) {
        return { error: fail(409, `Table ${busy.map((x) => x.table_id).join(', ')} is already booked for part of that time. Please choose again.`, { refresh: true }) };
      }
    }
    const live = await conn.query(`SELECT booking_id, start_time, duration_min, seats FROM res_booking WHERE org_id = ? AND booking_date = ? AND status IN ('C','A','N')`, [org_id, date]);
    const used = this._usage(live, except);
    const left = s.max_reserved_seats - Math.max(0, ...window.map((t) => used[t] || 0));
    if (seats > left) {
      const msg = left <= 0
        ? 'Sorry, this time is fully booked. Please choose another time.'
        : `Only ${left} reservable seat${left === 1 ? '' : 's'} left at this time - ${ids.length ? 'the chosen table(s) need' : 'your group needs'} ${seats}.`;
      return { error: fail(409, msg, { refresh: true }) };
    }
    if (!ids.length && !staff) {
      // online, a booking without tables is only for groups no free tables can seat (our staff then allocate)
      const busyIds = new Set((await conn.query(`SELECT DISTINCT table_id FROM res_booking_slot WHERE org_id = ? AND booking_date = ? AND slot_time IN (?)`, [org_id, date, window])).map((x) => x.table_id));
      const free = (await this._tables(conn, org_id)).filter((t) => t.online === 'Y' && !busyIds.has(t.table_id));
      if (bestTables(free, guests, left)) return { error: fail(409, 'Tables are free for your group at this time - please choose them on the floor plan.', { refresh: true }) };
    }
    return { session, tables, seats, guests, ids: sortTables(ids, tables), duration, window };
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

  async _holdTables(conn, org_id, date, booking_id, ids, window) {
    await conn.query(`DELETE FROM res_booking_slot WHERE org_id = ? AND booking_id = ?`, [org_id, booking_id]);
    for (const t of ids) {
      for (const slot of window) {
        await conn.query(`INSERT INTO res_booking_slot (org_id, booking_date, slot_time, table_id, booking_id) VALUES (?, ?, ?, ?, ?)`, [org_id, date, slot, t, booking_id]);
      }
    }
  }

  async _insert(conn, org_id, chk, contact, extra) {
    const booking_id = await this._seq(conn, org_id);
    const row = {
      org_id, booking_id, booking_date: extra.booking_date, seating_id: chk.session.seating_id, start_time: extra.start_time, duration_min: chk.duration,
      guests: chk.guests, seats: chk.seats, table_ids: chk.ids.join(','),
      kind: extra.kind, source: extra.source, ...contact,
      notes: str(extra.notes, 500) || null, staff_note: str(extra.staff_note, 500) || null,
      status: 'C', manage_token: crypto.randomBytes(18).toString('hex'),
      created_by: extra.created_by, created_date: new Date(),
    };
    await conn.query(`INSERT INTO res_booking SET ?`, [row]);
    await this._holdTables(conn, org_id, row.booking_date, booking_id, chk.ids, chk.window);
    return row;
  }

  // ---------- e-mails ----------
  _emailHtml(s, title, intro, row, seatingLabel, opts = {}) {
    const e = mailer.escapeHtml;
    const line = (k, v) => (v ? `<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap">${e(k)}</td><td style="padding:6px 0;font-weight:600">${e(v)}</td></tr>` : '');
    const tables = tableList(row.table_ids).join(' + ');
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
   ${line('Table(s)', tables || (opts.staffCopy ? 'TO ALLOCATE - please choose tables' : 'Our staff will choose your table(s)'))}
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

  _when(row) { return `${moment(ymd(row.booking_date), 'YYYY-MM-DD').format('ddd D MMM')} ${row.start_time}`; }

  async _mailBooked(s, row, seatingLabel) {
    const out = { customer: null, restaurant: null };
    const noTables = !tableList(row.table_ids).length;
    if (row.email && row.kind === 'C') {
      out.customer = await mailer.send({
        to: row.email, replyTo: (s.notify_email || '').split(',')[0],
        subject: `Your table is booked - ${this._when(row)} - ${s.restaurant_name || 'Thanjai Restaurant'}`,
        html: this._emailHtml(s, 'Your table is booked',
          `Hello ${mailer.escapeHtml(row.customer_name)}, thank you for booking with us. ${noTables ? 'Your time is confirmed - our staff will choose the best table(s) for your group and e-mail you the table numbers.' : 'We look forward to welcoming you.'}`,
          row, seatingLabel, {
            link: `${appUrl()}/reserve/booking/${row.manage_token}`, linkText: 'View or cancel my booking',
            after: `Your table is held for about ${row.duration_min || s.seating_minutes} minutes. If you are running late, please call us${s.phone ? ` at ${mailer.escapeHtml(s.phone)}` : ''}.`,
          }),
      });
    }
    if (s.notify_email && row.kind === 'C') {
      out.restaurant = await mailer.send({
        to: s.notify_email, replyTo: row.email || undefined,
        subject: `${noTables ? 'TABLES TO ALLOCATE - ' : ''}New reservation ${row.booking_id} - ${this._when(row)} - ${row.guests} guests${noTables ? '' : ` - ${tableList(row.table_ids).join('+')}`}`,
        html: this._emailHtml(s, `New reservation - ${row.guests} guests`, noTables ? 'A new reservation was made. <b>Please allocate tables</b> in Reservations - the guest gets an e-mail when you do.' : 'A new table reservation was made.', row, seatingLabel, {
          staffCopy: true, link: `${appUrl()}/reservations?date=${ymd(row.booking_date)}&seating=${row.seating_id}&time=${row.start_time}`, linkText: 'Open in Reservations',
        }),
      });
    }
    return out;
  }

  async _mailAllocated(s, row, seatingLabel) {
    if (!row.email) return { sent: false, reason: 'no e-mail' };
    return mailer.send({
      to: row.email, replyTo: (s.notify_email || '').split(',')[0],
      subject: `Your table: ${tableList(row.table_ids).join(' + ')} - ${this._when(row)} - ${s.restaurant_name || 'Thanjai Restaurant'}`,
      html: this._emailHtml(s, 'Your table is ready', `Hello ${mailer.escapeHtml(row.customer_name)}, we have set your table(s) for your visit.`, row, seatingLabel, {
        link: `${appUrl()}/reserve/booking/${row.manage_token}`, linkText: 'View or cancel my booking',
      }),
    });
  }

  async _mailCancelled(s, row, seatingLabel, byCustomer) {
    if (row.email && row.kind === 'C') {
      await mailer.send({
        to: row.email, replyTo: (s.notify_email || '').split(',')[0],
        subject: `Booking cancelled - ${this._when(row)} - ${s.restaurant_name || 'Thanjai Restaurant'}`,
        html: this._emailHtml(s, 'Your booking is cancelled', byCustomer
          ? 'Your booking has been cancelled as you asked. We hope to see you another time.'
          : `Your booking has been cancelled by the restaurant${row.cancel_reason ? `: ${mailer.escapeHtml(row.cancel_reason)}` : ''}. Please call us if you have any questions.`,
        row, seatingLabel, { link: `${appUrl()}/reserve`, linkText: 'Book another time' }),
      });
    }
    if (s.notify_email && row.kind === 'C' && byCustomer) {
      await mailer.send({
        to: s.notify_email,
        subject: `Cancelled by customer ${row.booking_id} - ${this._when(row)} - ${row.guests} guests`,
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
      const [sessions, tables, closures] = await Promise.all([
        this._sessions(conn, RES_ORG), this._tables(conn, RES_ORG), this._closures(conn, RES_ORG, today, last),
      ]);
      return ok({
        restaurant: {
          name: s.restaurant_name, phone: s.phone, address: s.address, booking_open: s.booking_open,
          max_party_online: s.max_party_online, days_ahead: s.days_ahead, seating_minutes: s.seating_minutes,
          min_notice_minutes: s.min_notice_minutes, cancel_notice_minutes: s.cancel_notice_minutes,
          guest_notes: String(s.guest_notes || '').split('\n').map((x) => x.trim()).filter(Boolean),
        },
        today, last_date: last,
        seatings: sessions.map(({ status, ...x }) => ({ ...x, slots: slotsOf(x) })),
        tables: tables.filter((t) => t.online === 'Y').map(({ status, online, ...t }) => t),
        decor: FLOOR_DECOR,
        closed_days: closures.filter((c) => c.seating_id === '').map((c) => ({ date: c.closed_date, reason: c.reason })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Every start time of a date with its state, seats left and the tables not free for it (no names). */
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
      const slots = [];
      d.sessions.filter((x) => d.sessionsAll.find((z) => z.seating_id === x.seating_id && z.status === 'A' && this._runsOn(z, date))).forEach((x) => {
        x.slots.forEach((z) => {
          let state = 'open';
          let reason = null;
          if (s.booking_open !== 'Y') { state = 'closed'; reason = 'Online booking paused'; }
          else if (date < now.format('YYYY-MM-DD') || tooFar) { state = 'closed'; reason = tooFar ? 'Not open for booking yet' : 'Past'; }
          else if (x.closed) { state = 'closed'; reason = x.closed; }
          else if (slotStart(date, z.time).subtract(s.min_notice_minutes, 'minutes').isBefore(now)) { state = 'past'; reason = 'Booking closed'; }
          else if (z.seats_left <= 0) { state = 'full'; reason = 'Fully booked'; }
          slots.push({
            seating_id: x.seating_id, label: x.label, start_time: z.time, state, reason,
            seats_left: z.seats_left, taken: Object.keys(z.busy).filter((t) => onlineTables.has(t)),
          });
        });
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
      // one booking per customer per session and day
      const dup = await conn.query(
        `SELECT booking_id FROM res_booking WHERE org_id = ? AND booking_date = ? AND seating_id = ? AND status IN ('C','A','N') AND kind = 'C'
            AND (email = ? OR REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')','') = ?) LIMIT 1`,
        [RES_ORG, b.booking_date, chk.session.seating_id, contact.email, String(contact.phone).replace(/[\s()-]/g, '')]);
      if (dup.length) {
        return fail(409, `You already have a booking for this ${chk.session.label.toLowerCase()} (${dup[0].booking_id}). To change it, cancel it from the link in your e-mail and book again, or call us.`);
      }
      const row = await this._insert(conn, RES_ORG, chk, contact, {
        booking_date: b.booking_date, start_time: b.start_time, kind: 'C', source: 'W', notes: b.notes, created_by: 'website',
      });
      mailInfo = { s, row, label: chk.session.label };
      return ok({ booking: { ...this._bookingOut(row, chk.tables, [chk.session]), manage_token: row.manage_token } });
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
      const [sessions, tables] = await Promise.all([this._sessions(conn, RES_ORG, false), this._tables(conn, RES_ORG, false)]);
      const out = this._bookingOut(b, tables, sessions);
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
      await conn.query(`UPDATE res_booking SET status = 'X', cancelled_by = 'customer', cancelled_date = ?, cancel_reason = 'Cancelled online by the customer'
                         WHERE org_id = ? AND booking_id = ?`, [new Date(), b.org_id, b.booking_id]);
      await conn.query(`DELETE FROM res_booking_slot WHERE org_id = ? AND booking_id = ?`, [b.org_id, b.booking_id]);
      const [sess] = await conn.query(`SELECT label FROM res_seating WHERE org_id = ? AND seating_id = ?`, [b.org_id, b.seating_id]);
      mailInfo = { s, row: { ...b, status: 'X' }, label: sess ? sess.label : '' };
      return ok({ message: 'Your booking is cancelled' });
    });
    if (mailInfo) await this._mailCancelled(mailInfo.s, mailInfo.row, mailInfo.label, true);
    return r;
  }

  // ---------- staff ----------
  /** Everything for one date: sessions with every start time and its figures, tables, bookings. */
  async day(org_id, date) {
    if (!isDate(date)) return fail(400, 'Choose a date');
    const conn = await this.getReadConnection();
    try {
      const s = await this._settings(conn, org_id);
      if (!s) return fail(503, 'Reservations are not set up yet (run the database migration)');
      const d = await this._day(conn, org_id, date, s);
      return ok({
        date,
        settings: { max_reserved_seats: s.max_reserved_seats, restaurant_name: s.restaurant_name, phone: s.phone, booking_open: s.booking_open, seating_minutes: s.seating_minutes },
        seatings: d.sessions,
        tables: d.tables,
        decor: FLOOR_DECOR,
        closures: d.closures,
        bookings: d.bookings.map((b) => this._bookingOut(b, d.tables, d.sessionsAll)),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  /** Staff booking (phone / walk-up; tables optional - allocate later) or a staff block. b.kind: C (default) or B. */
  async staffCreate(user, b) {
    b = b || {};
    const kind = b.kind === 'B' ? 'B' : 'C';
    const contact = this._contact(b, { staff: true, kind });
    if (contact.error) return contact.error;
    let mailInfo = null;
    const r = await this._withLock(user.org_id, async (conn, s) => {
      const chk = await this._check(conn, user.org_id, s, { ...b, kind }, { staff: true });
      if (chk.error) return chk.error;
      const row = await this._insert(conn, user.org_id, chk, contact, {
        booking_date: b.booking_date, start_time: b.start_time, kind, source: 'S', notes: b.notes, staff_note: b.staff_note, created_by: user.user_id,
      });
      if (kind === 'C' && b.send_email !== false && (row.email || s.notify_email)) mailInfo = { s, row, label: chk.session.label };
      return ok({ message: kind === 'B' ? `Blocked ${chk.ids.join(' + ')}` : `Booked ${row.booking_id}${chk.ids.length ? '' : ' - tables still to allocate'}`, booking: this._bookingOut(row, chk.tables, [chk.session]) });
    });
    if (mailInfo) await this._mailBooked(mailInfo.s, mailInfo.row, mailInfo.label);
    return r;
  }

  /**
   * Change a booking: date, session, start time, guests, tables, table time and/or details. Giving tables to a booking
   * that had none is "allocating"; with notify (default) the guest is e-mailed the table numbers.
   */
  async staffUpdate(user, b) {
    b = b || {};
    let mailInfo = null;
    const r = await this._withLock(user.org_id, async (conn, s) => {
      const [cur] = await conn.query(`SELECT * FROM res_booking WHERE org_id = ? AND booking_id = ? FOR UPDATE`, [user.org_id, b.booking_id]);
      if (!cur) return fail(404, 'Booking not found');
      if (cur.status === 'X') return fail(409, 'This booking is cancelled');
      const merged = {
        booking_date: b.booking_date || ymd(cur.booking_date), seating_id: b.seating_id || cur.seating_id, start_time: b.start_time || cur.start_time,
        guests: b.guests !== undefined ? b.guests : cur.guests, duration_min: b.duration_min || cur.duration_min,
        table_ids: Array.isArray(b.table_ids) ? b.table_ids : tableList(cur.table_ids), kind: cur.kind,
      };
      const contact = this._contact({
        customer_name: b.customer_name !== undefined ? b.customer_name : cur.customer_name,
        phone: b.phone !== undefined ? b.phone : cur.phone, email: b.email !== undefined ? b.email : cur.email,
      }, { staff: true, kind: cur.kind });
      if (contact.error) return contact.error;
      const chk = await this._check(conn, user.org_id, s, merged, { staff: true, except: cur.booking_id });
      if (chk.error) return chk.error;
      const upd = {
        booking_date: merged.booking_date, seating_id: chk.session.seating_id, start_time: merged.start_time, duration_min: chk.duration,
        guests: chk.guests, seats: chk.seats, table_ids: chk.ids.join(','), ...contact,
        notes: b.notes !== undefined ? str(b.notes, 500) || null : cur.notes,
        staff_note: b.staff_note !== undefined ? str(b.staff_note, 500) || null : cur.staff_note,
        updated_by: user.user_id, updated_date: new Date(),
      };
      await conn.query(`UPDATE res_booking SET ? WHERE org_id = ? AND booking_id = ?`, [upd, user.org_id, cur.booking_id]);
      await this._holdTables(conn, user.org_id, upd.booking_date, cur.booking_id, chk.ids, chk.window);
      const allocated = !tableList(cur.table_ids).length && chk.ids.length > 0;
      const row = { ...cur, ...upd };
      if (allocated && b.notify !== false && row.email && cur.kind === 'C') mailInfo = { s, row, label: chk.session.label };
      return ok({
        message: allocated ? `${cur.booking_id}: tables ${chk.ids.join(' + ')} allocated${mailInfo ? ' - guest e-mailed' : ''}` : `${cur.booking_id} updated`,
        booking: this._bookingOut(row, chk.tables, [chk.session]),
      });
    });
    if (mailInfo) {
      const m = await this._mailAllocated(mailInfo.s, mailInfo.row, mailInfo.label);
      if (!m.sent) r.message = r.message.replace(' - guest e-mailed', ` - e-mail not sent (${m.reason})`);
    }
    return r;
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
        await conn.query(`DELETE FROM res_booking_slot WHERE org_id = ? AND booking_id = ?`, [user.org_id, cur.booking_id]);
        if (b.notify && cur.email) {
          const [sess] = await conn.query(`SELECT label FROM res_seating WHERE org_id = ? AND seating_id = ?`, [user.org_id, cur.seating_id]);
          mailInfo = { s, row: { ...cur, status: 'X', cancel_reason: reason }, label: sess ? sess.label : '' };
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

  /** Bookings by customer name / phone / e-mail / booking no. (newest first). */
  async search(org_id, q) {
    const term = str(q, 60);
    if (term.length < 2) return ok({ bookings: [] });
    const conn = await this.getReadConnection();
    try {
      const like = `%${term}%`;
      const rows = await conn.query(
        `SELECT * FROM res_booking WHERE org_id = ? AND (booking_id LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR email LIKE ?)
          ORDER BY booking_date DESC, start_time LIMIT 50`, [org_id, like, like, like, like]);
      const [sessions, tables] = await Promise.all([this._sessions(conn, org_id, false), this._tables(conn, org_id, false)]);
      return ok({ bookings: rows.map((b) => this._bookingOut(b, tables, sessions)) });
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
      const [sessions, tables, closures] = await Promise.all([
        this._sessions(conn, org_id, false), this._tables(conn, org_id, false),
        this._closures(conn, org_id, today, nowLocal().add(2, 'years').format('YYYY-MM-DD')),
      ]);
      return ok({ settings: s, seatings: sessions.map((x) => ({ ...x, slots: slotsOf(x) })), tables, closures, decor: FLOOR_DECOR, mail_configured: mailer.configured(), public_url: `${appUrl()}/reserve` });
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
      seating_minutes: Math.ceil(int(b.seating_minutes, 15, 600, 90) / STEP) * STEP,
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
      return ok({ message: 'Settings saved (new table time applies to new bookings)' });
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  /** A session: name, first and last start time, minutes between start times, days. */
  async saveSeating(user, b) {
    b = b || {};
    const label = str(b.label, 50);
    if (!label) return fail(400, 'Enter a name, e.g. Lunch or Dinner');
    if (!isTime(b.start_time)) return fail(400, 'Enter the first start time as HH:MM (24-hour), e.g. 11:00');
    const end = b.end_time || b.start_time;
    if (!isTime(end) || toMin(end) < toMin(b.start_time)) return fail(400, 'The last start time must be the same as or after the first');
    const every = parseInt(b.interval_min, 10);
    if (!(every >= 15 && every <= 240 && every % STEP === 0)) return fail(400, 'Minutes between start times: 15, 30, 45, 60 ...');
    if ((toMin(b.start_time) % STEP) || (toMin(end) % STEP)) return fail(400, 'Start times must be on the quarter hour (:00, :15, :30, :45)');
    const weekdays = [...new Set(String(b.weekdays || '').replace(/[^0-6]/g, '').split(''))].sort().join('');
    if (!weekdays) return fail(400, 'Tick at least one day');
    const conn = await this.getWriteConnection();
    try {
      let id = str(b.seating_id, 20).toUpperCase().replace(/[^A-Z0-9_]/g, '');
      const rows = await conn.query(`SELECT * FROM res_seating WHERE org_id = ?`, [user.org_id]);
      if (!id) {
        let n = rows.length + 1;
        while (rows.some((r) => r.seating_id === `S${n}`)) n++;
        id = `S${n}`;
      }
      if (b.status !== 'I') {
        const clash = rows.find((r) => r.seating_id !== id && r.status === 'A' && r.weekdays.split('').some((d) => weekdays.includes(d))
          && toMin(b.start_time) <= toMin(r.end_time || r.start_time) && toMin(end) >= toMin(r.start_time));
        if (clash) return fail(409, `Overlaps ${clash.label} (${clash.start_time}-${clash.end_time || clash.start_time}) on the same day(s)`);
      }
      const v = { label, start_time: b.start_time, end_time: end, interval_min: every, weekdays, sort_order: parseInt(b.sort_order, 10) || 0, status: b.status === 'I' ? 'I' : 'A', updated_by: user.user_id, updated_date: new Date() };
      await conn.query(`INSERT INTO res_seating SET ? ON DUPLICATE KEY UPDATE ?`, [{ org_id: user.org_id, seating_id: id, ...v }, v]);
      return ok({ message: `${label} saved: ${slotsOf(v).length} start times (${slotsOf(v)[0]} - ${end}). Existing bookings keep their times.`, seating_id: id });
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
      orient: b.orient === 'V' ? 'V' : 'H', online: b.online === 'N' ? 'N' : 'Y', joinable: b.joinable === 'N' ? 'N' : 'Y', status: b.status === 'I' ? 'I' : 'A',
      sort_order: parseInt(b.sort_order, 10) || 0, updated_by: user.user_id, updated_date: new Date(),
    };
    const conn = await this.getWriteConnection();
    try {
      if (v.status === 'I') {
        const rows = await conn.query(`SELECT DISTINCT booking_id FROM res_booking_slot WHERE org_id = ? AND table_id = ? AND booking_date >= ? LIMIT 5`,
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
module.exports = { reservationModule, STATUS_LABEL, _test: { hits, bestTables, slotsOf, steps } };
