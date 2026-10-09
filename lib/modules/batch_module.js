// Batches, stock ledger, dispatch allocation, inventory, alerts and batch reports.
//
// Batch number = branch short code (2) + product short code (2-3) + MMDDYY (manufacturing date) + serial (4+ digits,
// one continuous counter per organisation), e.g. TSVD1009260001.
// Only products with a short code are batch-tracked. Stock = sum of remaining qty in open batches.
// Every change is written to stock_movement (PRODUCE, OPENING, DISPATCH, WRITEOFF, ADJUST, REVERSAL).
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const today = () => moment().tz(TZ).format('YYYY-MM-DD');
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && moment(d, 'YYYY-MM-DD', true).isValid();
const q3 = (n) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });

const CLOSE_REASONS = {
  USED: 'Fully dispatched', WASTED: 'Wasted', EXPIRED: 'Expired', DAMAGED: 'Damaged',
  OUTSIDE: 'Sold / used outside the system', OTHER: 'Other',
};
const EXPIRY_WARN_DAYS = 2;

class BatchModule extends BaseDao {
  // ---------- products ----------
  async _products(conn, org_id, ids) {
    const where = ids ? 'AND p.product_id IN (?)' : '';
    const rows = await conn.query(
      `SELECT p.product_id, MAX(p.product_name) AS product_name, MAX(p.uom) AS uom, MAX(p.short_code) AS short_code,
              MAX(COALESCE(p.producing_branch_id, p.branch_id)) AS producing_branch_id, MAX(p.shelf_life_days) AS shelf_life_days,
              MAX(p.reorder_level) AS reorder_level, MAX(p.default_taxable) AS default_taxable
         FROM product_master p WHERE p.org_id = ? ${where} GROUP BY p.product_id`,
      ids ? [org_id, ids] : [org_id]);
    return Object.fromEntries(rows.map((r) => [r.product_id, r]));
  }

  async _branchMap(conn, org_id) {
    const rows = await conn.query(`SELECT branch_id, branch_name, short_code, branch_type FROM branch_master WHERE org_id = ?`, [org_id]);
    return Object.fromEntries(rows.map((b) => [b.branch_id, b]));
  }

  async _nextSerial(conn, org_id) {
    await conn.query(`INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES ('BATCH', ?, 0)`, [org_id]);
    await conn.query(`UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1) WHERE seq_type = 'BATCH' AND branch_id = ?`, [org_id]);
    const [row] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
    return row.n;
  }

  _move(conn, m) {
    return conn.query(`INSERT INTO stock_movement SET ?`, [{ ...m, created_date: new Date() }]);
  }

  // Validates and creates one batch inside an open transaction. Returns { batch } or { error }.
  async _create(conn, user, input, products, branches, source) {
    const p = products[input.product_id];
    if (!p) return { error: 'Product not found' };
    if (!p.short_code) return { error: `${p.product_name}: set a short code in Product Master first` };
    const br = branches[p.producing_branch_id];
    if (!br || !br.short_code) return { error: `${p.product_name}: set a producing branch with a short code (Branch Master)` };
    const qty = q3(input.qty);
    if (!(qty > 0) || qty > 10000000) return { error: `${p.product_name}: enter a quantity greater than 0` };
    const mfg = input.mfg_date || today();
    if (!isDate(mfg)) return { error: `${p.product_name}: manufacturing date must be YYYY-MM-DD` };
    if (mfg > today()) return { error: `${p.product_name}: manufacturing date cannot be in the future` };
    let best = input.best_before || (p.shelf_life_days ? moment(mfg).add(p.shelf_life_days, 'days').format('YYYY-MM-DD') : null);
    if (best && !isDate(best)) return { error: `${p.product_name}: best-before must be YYYY-MM-DD` };
    if (best && best < mfg) return { error: `${p.product_name}: best-before is before the manufacturing date` };
    const cost = num(input.unit_cost);
    if (cost !== null && !(cost >= 0)) return { error: `${p.product_name}: unit cost must be 0 or more` };

    const serial = await this._nextSerial(conn, user.org_id);
    const batch_no = `${br.short_code}${p.short_code}${moment(mfg).format('MMDDYY')}${String(serial).padStart(4, '0')}`;
    const row = {
      org_id: user.org_id, batch_no, product_id: input.product_id, branch_id: p.producing_branch_id, mfg_date: mfg,
      best_before: best, qty_produced: qty, qty_remaining: qty, uom: p.uom, unit_cost: cost,
      note: input.note ? String(input.note).slice(0, 500) : null, status: 'O', source,
      created_by: user.user_id, created_date: new Date(),
    };
    await conn.query(`INSERT INTO batch_master SET ?`, [row]);
    await this._move(conn, {
      org_id: user.org_id, branch_id: row.branch_id, product_id: row.product_id, batch_no, move_date: mfg,
      move_type: source === 'I' ? 'OPENING' : 'PRODUCE', qty, note: source === 'I' ? 'Opening stock' : null, created_by: user.user_id,
    });
    return { batch: row };
  }

  async create(user, body) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const products = await this._products(conn, user.org_id, [body.product_id || '']);
      const branches = await this._branchMap(conn, user.org_id);
      const r = await this._create(conn, user, body, products, branches, 'E');
      if (r.error) { await conn.rollback(); return fail(400, r.error); }
      await conn.commit();
      return ok({ message: `Batch ${r.batch.batch_no} created`, batch: r.batch });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // One-time opening stock load (Excel template). All rows are checked first; nothing is saved if any row fails.
  async importOpening(user, rows) {
    if (!Array.isArray(rows) || !rows.length) return fail(400, 'The file has no rows');
    if (rows.length > 2000) return fail(400, 'At most 2000 rows per file');
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const products = await this._products(conn, user.org_id, null);
      const byCode = Object.fromEntries(Object.values(products).filter((p) => p.short_code).map((p) => [p.short_code.toUpperCase(), p]));
      const branches = await this._branchMap(conn, user.org_id);
      const errors = [];
      const created = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const code = String(r.product_code || '').trim().toUpperCase();
        const p = byCode[code] || products[String(r.product_id || '').trim()];
        if (!code && !r.product_id && !r.qty) continue; // blank line
        if (!p) { errors.push({ row: r.excel_row || i + 2, message: `Unknown product code "${code || r.product_id || ''}"` }); continue; }
        const res = await this._create(conn, user, {
          product_id: p.product_id, qty: r.qty, mfg_date: r.mfg_date, best_before: r.best_before || null,
          unit_cost: r.unit_cost, note: r.note || 'Opening stock',
        }, products, branches, 'I');
        if (res.error) errors.push({ row: r.excel_row || i + 2, message: res.error });
        else created.push(res.batch.batch_no);
      }
      if (errors.length) {
        await conn.rollback();
        return fail(400, `${errors.length} row(s) need fixing. Nothing was loaded.`, { errors });
      }
      if (!created.length) { await conn.rollback(); return fail(400, 'No rows with a product and quantity'); }
      await conn.commit();
      return ok({ message: `${created.length} opening batch(es) loaded`, created });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async update(user, body) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const [b] = await conn.query(`SELECT * FROM batch_master WHERE org_id = ? AND batch_no = ? FOR UPDATE`, [user.org_id, body.batch_no]);
      if (!b) { await conn.rollback(); return fail(404, 'Batch not found'); }
      if (b.status !== 'O') { await conn.rollback(); return fail(400, 'Closed batches cannot be changed'); }
      const set = { updated_by: user.user_id, updated_date: new Date() };
      if (body.best_before !== undefined) {
        if (body.best_before && !isDate(body.best_before)) { await conn.rollback(); return fail(400, 'Best-before must be a date'); }
        set.best_before = body.best_before || null;
      }
      if (body.note !== undefined) set.note = body.note ? String(body.note).slice(0, 500) : null;
      if (body.unit_cost !== undefined) set.unit_cost = num(body.unit_cost);
      if (body.qty_produced !== undefined && q3(body.qty_produced) !== Number(b.qty_produced)) {
        const newQty = q3(body.qty_produced);
        const delta = q3(newQty - Number(b.qty_produced));
        const remaining = q3(Number(b.qty_remaining) + delta);
        if (!(newQty > 0)) { await conn.rollback(); return fail(400, 'Quantity must be greater than 0'); }
        if (remaining < 0) { await conn.rollback(); return fail(400, `Already ${q3(b.qty_produced - b.qty_remaining)} used from this batch; quantity cannot go below that`); }
        set.qty_produced = newQty;
        set.qty_remaining = remaining;
        await this._move(conn, {
          org_id: user.org_id, branch_id: b.branch_id, product_id: b.product_id, batch_no: b.batch_no, move_date: today(),
          move_type: 'ADJUST', qty: delta, note: 'Produced quantity corrected', created_by: user.user_id,
        });
      }
      await conn.query(`UPDATE batch_master SET ? WHERE org_id = ? AND batch_no = ?`, [set, user.org_id, b.batch_no]);
      await conn.commit();
      return ok({ message: 'Batch updated' });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // Manual close: any remaining quantity is written off with the reason.
  async close(user, body) {
    const reason = body && body.reason;
    if (!CLOSE_REASONS[reason] || reason === 'USED') return fail(400, 'Choose a reason');
    if (reason === 'OTHER' && !String(body.note || '').trim()) return fail(400, 'Add a note for "Other"');
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const [b] = await conn.query(`SELECT * FROM batch_master WHERE org_id = ? AND batch_no = ? FOR UPDATE`, [user.org_id, body.batch_no]);
      if (!b) { await conn.rollback(); return fail(404, 'Batch not found'); }
      if (b.status !== 'O') { await conn.rollback(); return fail(400, 'Batch is already closed'); }
      const left = Number(b.qty_remaining);
      if (left > 0) {
        await this._move(conn, {
          org_id: user.org_id, branch_id: b.branch_id, product_id: b.product_id, batch_no: b.batch_no, move_date: today(),
          move_type: 'WRITEOFF', qty: -left, note: `${CLOSE_REASONS[reason]}${body.note ? ': ' + String(body.note).slice(0, 400) : ''}`,
          created_by: user.user_id,
        });
      }
      await conn.query(
        `UPDATE batch_master SET status = 'C', qty_remaining = 0, close_reason = ?, close_note = ?, closed_by = ?, closed_date = NOW(),
                updated_by = ?, updated_date = NOW() WHERE org_id = ? AND batch_no = ?`,
        [reason, body.note ? String(body.note).slice(0, 500) : null, user.user_id, user.user_id, user.org_id, b.batch_no]);
      await conn.commit();
      return ok({ message: left > 0 ? `Batch closed; ${left} ${b.uom || ''} written off` : 'Batch closed' });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  async list(org_id, f = {}) {
    const conn = await this.getReadConnection();
    try {
      const where = ['b.org_id = ?'];
      const params = [org_id];
      if (['O', 'C'].includes(f.status)) { where.push('b.status = ?'); params.push(f.status); }
      if (f.product_id) { where.push('b.product_id = ?'); params.push(f.product_id); }
      if (f.branch_id) { where.push('b.branch_id = ?'); params.push(f.branch_id); }
      if (isDate(f.from_date)) { where.push('b.mfg_date >= ?'); params.push(f.from_date); }
      if (isDate(f.to_date)) { where.push('b.mfg_date <= ?'); params.push(f.to_date); }
      if (f.q) { where.push('b.batch_no LIKE ?'); params.push(`%${String(f.q).trim()}%`); }
      const rows = await conn.query(
        `SELECT b.batch_no, b.product_id, b.branch_id, DATE_FORMAT(b.mfg_date,'%Y-%m-%d') AS mfg_date,
                DATE_FORMAT(b.best_before,'%Y-%m-%d') AS best_before, b.qty_produced, b.qty_remaining, b.uom, b.unit_cost, b.note,
                b.status, b.source, b.close_reason, b.close_note, DATE_FORMAT(b.closed_date,'%Y-%m-%d') AS closed_date, b.created_by,
                (SELECT MAX(p.product_name) FROM product_master p WHERE p.org_id = b.org_id AND p.product_id = b.product_id) AS product_name,
                (SELECT br.branch_name FROM branch_master br WHERE br.org_id = b.org_id AND br.branch_id = b.branch_id) AS branch_name,
                COALESCE((SELECT -SUM(m.qty) FROM stock_movement m WHERE m.org_id = b.org_id AND m.batch_no = b.batch_no
                           AND m.move_type IN ('DISPATCH','REVERSAL')), 0) AS qty_dispatched,
                COALESCE((SELECT -SUM(m.qty) FROM stock_movement m WHERE m.org_id = b.org_id AND m.batch_no = b.batch_no
                           AND m.move_type = 'WRITEOFF'), 0) AS qty_written_off
           FROM batch_master b WHERE ${where.join(' AND ')}
          ORDER BY b.status = 'C', b.mfg_date DESC, b.batch_no DESC LIMIT 1000`, params);
      const t = today();
      const soon = moment(t).add(EXPIRY_WARN_DAYS, 'days').format('YYYY-MM-DD');
      for (const r of rows) {
        ['qty_produced', 'qty_remaining', 'qty_dispatched', 'qty_written_off'].forEach((k) => (r[k] = Number(r[k])));
        r.unit_cost = num(r.unit_cost);
        r.expiry = r.status === 'O' && r.best_before ? (r.best_before < t ? 'expired' : r.best_before <= soon ? 'soon' : null) : null;
        r.close_reason_label = r.close_reason ? CLOSE_REASONS[r.close_reason] : null;
      }
      return ok({ batches: rows, close_reasons: CLOSE_REASONS });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // Traceability: one batch, every movement, every indent / branch / invoice it went to
  async trace(org_id, batch_no) {
    const conn = await this.getReadConnection();
    try {
      const list = await this.list(org_id, { q: batch_no });
      const batch = list.batches.find((b) => b.batch_no === batch_no);
      if (!batch) return fail(404, 'Batch not found');
      const movements = await conn.query(
        `SELECT movement_id, DATE_FORMAT(move_date,'%Y-%m-%d') AS move_date, move_type, qty, ref_no, note, created_by
           FROM stock_movement WHERE org_id = ? AND batch_no = ? ORDER BY movement_id`, [org_id, batch_no]);
      const dispatches = await conn.query(
        `SELECT a.indent_number, a.item_code, a.qty, h.branch_id, br.branch_name, h.status,
                DATE_FORMAT(h.indent_date,'%Y-%m-%d') AS indent_date, DATE_FORMAT(h.delivery_date,'%Y-%m-%d') AS delivery_date,
                i.invoice_number
           FROM indent_batch_alloc a
           JOIN indent_header h ON h.org_id = a.org_id AND h.indent_number = a.indent_number AND h.kitchen_id = a.kitchen_id
           LEFT JOIN branch_master br ON br.org_id = h.org_id AND br.branch_id = h.branch_id
           LEFT JOIN invoice_header i ON i.org_id = a.org_id AND i.indent_number = a.indent_number AND i.kitchen_id = a.kitchen_id
          WHERE a.org_id = ? AND a.batch_no = ? ORDER BY a.created_date`, [org_id, batch_no]);
      return ok({
        batch,
        movements: movements.map((m) => ({ ...m, qty: Number(m.qty) })),
        dispatches: dispatches.map((d) => ({ ...d, qty: Number(d.qty) })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- dispatch ----------
  // Items of an indent that need batches, with open batches and a suggested oldest-first split.
  async _openBatches(conn, org_id, productIds, lock) {
    if (!productIds.length) return [];
    return conn.query(
      `SELECT batch_no, product_id, branch_id, DATE_FORMAT(mfg_date,'%Y-%m-%d') AS mfg_date,
              DATE_FORMAT(best_before,'%Y-%m-%d') AS best_before, qty_remaining
         FROM batch_master WHERE org_id = ? AND status = 'O' AND qty_remaining > 0 AND product_id IN (?)
        ORDER BY mfg_date, batch_no ${lock ? 'FOR UPDATE' : ''}`, [org_id, productIds]);
  }

  _fifo(batches, qty) {
    let left = q3(qty);
    const alloc = [];
    for (const b of batches) {
      if (left <= 0) break;
      const take = q3(Math.min(left, Number(b.qty_remaining)));
      if (take > 0) { alloc.push({ batch_no: b.batch_no, qty: take }); left = q3(left - take); }
    }
    return { alloc, short: left > 0 ? left : 0 };
  }

  async suggest(org_id, indent_number, qtyOverride) {
    const conn = await this.getReadConnection();
    try {
      const items = await conn.query(
        `SELECT d.item_code, d.qty_ordered, d.qty_agreed_kitchen FROM indent_detail d
          WHERE d.org_id = ? AND d.indent_number = ? ORDER BY d.item_code`, [org_id, indent_number]);
      const products = await this._products(conn, org_id, items.map((i) => i.item_code).concat(['']));
      const tracked = items.filter((i) => products[i.item_code] && products[i.item_code].short_code);
      const batches = await this._openBatches(conn, org_id, tracked.map((i) => i.item_code), false);
      const out = tracked.map((i) => {
        const qty = q3(num(qtyOverride && qtyOverride[i.item_code]) ?? num(i.qty_agreed_kitchen) ?? num(i.qty_ordered) ?? 0);
        const open = batches.filter((b) => b.product_id === i.item_code).map((b) => ({ ...b, qty_remaining: Number(b.qty_remaining) }));
        const { alloc, short } = this._fifo(open, qty);
        return {
          item_code: i.item_code, product_name: products[i.item_code].product_name, uom: products[i.item_code].uom,
          qty, available: q3(open.reduce((s, b) => s + b.qty_remaining, 0)), batches: open, suggested: alloc, short,
        };
      });
      return ok({ items: out });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // Called when the kitchen dispatches (F -> D). Applies the chosen (or oldest-first) split in one transaction.
  // details: [{ item_code, qty_agreed_kitchen }], alloc: { item_code: [{ batch_no, qty }] }
  // Returns { ok: true, applied } or a fail(...) response.
  async applyDispatch(user, indent, details, alloc) {
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const codes = (details || []).map((d) => d.item_code);
      const products = await this._products(conn, user.org_id, codes.concat(['']));
      const need = (details || [])
        .filter((d) => products[d.item_code] && products[d.item_code].short_code)
        .map((d) => ({ item_code: d.item_code, qty: q3(num(d.qty_agreed_kitchen) || 0) }))
        .filter((d) => d.qty > 0);
      if (!need.length) { await conn.commit(); return { ok: true, applied: [] }; }

      const open = await this._openBatches(conn, user.org_id, need.map((n) => n.item_code), true);
      const byNo = Object.fromEntries(open.map((b) => [b.batch_no, { ...b, qty_remaining: Number(b.qty_remaining) }]));
      const problems = [];
      const plan = [];
      for (const n of need) {
        const name = products[n.item_code].product_name;
        let split = Array.isArray(alloc && alloc[n.item_code]) ? alloc[n.item_code]
          .map((a) => ({ batch_no: String(a.batch_no), qty: q3(num(a.qty) || 0) })).filter((a) => a.qty > 0) : null;
        if (!split || !split.length) {
          const f = this._fifo(Object.values(byNo).filter((b) => b.product_id === n.item_code), n.qty);
          if (f.short > 0) { problems.push({ item_code: n.item_code, product_name: name, need: n.qty, short: f.short }); continue; }
          split = f.alloc;
        }
        const total = q3(split.reduce((s, a) => s + a.qty, 0));
        if (total !== n.qty) { problems.push({ item_code: n.item_code, product_name: name, need: n.qty, message: `batches add up to ${total}, dispatch qty is ${n.qty}` }); continue; }
        for (const a of split) {
          const b = byNo[a.batch_no];
          if (!b || b.product_id !== n.item_code) { problems.push({ item_code: n.item_code, product_name: name, message: `batch ${a.batch_no} is not open for this product` }); continue; }
          if (a.qty > b.qty_remaining) { problems.push({ item_code: n.item_code, product_name: name, message: `batch ${a.batch_no} has only ${b.qty_remaining} left` }); continue; }
          b.qty_remaining = q3(b.qty_remaining - a.qty); // reserve within this request
          plan.push({ ...a, item_code: n.item_code, product_id: n.item_code, branch_id: b.branch_id });
        }
      }
      if (problems.length) {
        await conn.rollback();
        const shortList = problems.filter((p) => p.short).map((p) => `${p.product_name} (short ${p.short})`);
        return fail(409, shortList.length
          ? `Not enough batch stock: ${shortList.join(', ')}. Enter the batch first, then dispatch.`
          : `Check the batches: ${problems.map((p) => `${p.product_name} - ${p.message}`).join('; ')}`,
          { code: 'BATCH_STOCK', problems });
      }
      const d = today();
      for (const a of plan) {
        await conn.query(
          `UPDATE batch_master SET qty_remaining = qty_remaining - ?, updated_by = ?, updated_date = NOW(),
                  status = IF(qty_remaining <= 0, 'C', status), close_reason = IF(qty_remaining <= 0, 'USED', close_reason),
                  closed_date = IF(qty_remaining <= 0, NOW(), closed_date)
            WHERE org_id = ? AND batch_no = ?`, [a.qty, user.user_id, user.org_id, a.batch_no]);
        await this._move(conn, {
          org_id: user.org_id, branch_id: a.branch_id, product_id: a.product_id, batch_no: a.batch_no, move_date: d,
          move_type: 'DISPATCH', qty: -a.qty, ref_no: indent.indent_number, created_by: user.user_id,
        });
        await conn.query(
          `INSERT INTO indent_batch_alloc (org_id, indent_number, kitchen_id, item_code, batch_no, qty, created_by, created_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
          [user.org_id, indent.indent_number, indent.kitchen_id, a.item_code, a.batch_no, a.qty, user.user_id]);
      }
      await conn.commit();
      return { ok: true, applied: plan };
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // Undo applyDispatch if the indent update itself failed afterwards.
  async reverseDispatch(user, indent, applied) {
    if (!applied || !applied.length) return;
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      for (const a of applied) {
        await conn.query(
          `UPDATE batch_master SET qty_remaining = qty_remaining + ?, status = 'O', close_reason = NULL, closed_date = NULL
            WHERE org_id = ? AND batch_no = ?`, [a.qty, user.org_id, a.batch_no]);
        await this._move(conn, {
          org_id: user.org_id, branch_id: a.branch_id, product_id: a.product_id, batch_no: a.batch_no, move_date: today(),
          move_type: 'REVERSAL', qty: a.qty, ref_no: indent.indent_number, note: 'Dispatch failed - returned to batch', created_by: user.user_id,
        });
        await conn.query(
          `UPDATE indent_batch_alloc SET qty = qty - ? WHERE org_id = ? AND indent_number = ? AND kitchen_id = ? AND item_code = ? AND batch_no = ?`,
          [a.qty, user.org_id, indent.indent_number, indent.kitchen_id, a.item_code, a.batch_no]);
      }
      await conn.query(`DELETE FROM indent_batch_alloc WHERE org_id = ? AND indent_number = ? AND qty <= 0`, [user.org_id, indent.indent_number]);
      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      console.error('[BATCH] reverse failed for', indent.indent_number, err && err.message);
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // Batch numbers per item for an indent (invoice lines, indent view)
  async allocations(conn, org_id, indent_number) {
    const rows = await conn.query(
      `SELECT item_code, batch_no, qty FROM indent_batch_alloc WHERE org_id = ? AND indent_number = ? ORDER BY batch_no`,
      [org_id, indent_number]);
    const out = {};
    for (const r of rows) (out[r.item_code] = out[r.item_code] || []).push({ batch_no: r.batch_no, qty: Number(r.qty) });
    return out;
  }

  async indentAllocations(org_id, indent_number) {
    const conn = await this.getReadConnection();
    try {
      return ok({ allocations: await this.allocations(conn, org_id, indent_number) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- inventory ----------
  // Current stock per batch-tracked product, with demand from accepted indents not yet dispatched.
  async _stock(conn, org_id, branch_id) {
    const products = Object.values(await this._products(conn, org_id, null)).filter((p) => p.short_code)
      .filter((p) => !branch_id || p.producing_branch_id === branch_id);
    if (!products.length) return [];
    const ids = products.map((p) => p.product_id);
    const onHand = await conn.query(
      `SELECT product_id, SUM(qty_remaining) AS on_hand, COUNT(*) AS open_batches, MIN(mfg_date) AS oldest_mfg,
              DATE_FORMAT(MIN(best_before),'%Y-%m-%d') AS next_best_before
         FROM batch_master WHERE org_id = ? AND status = 'O' AND qty_remaining > 0 AND product_id IN (?) GROUP BY product_id`, [org_id, ids]);
    const demand = await conn.query(
      `SELECT d.item_code, SUM(COALESCE(d.qty_agreed_kitchen, d.qty_ordered, 0)) AS reserved,
              GROUP_CONCAT(DISTINCT d.indent_number ORDER BY d.indent_number) AS indents
         FROM indent_detail d JOIN indent_header h ON h.org_id = d.org_id AND h.indent_number = d.indent_number AND h.kitchen_id = d.kitchen_id
        WHERE d.org_id = ? AND h.status IN ('A','F') AND d.item_code IN (?) GROUP BY d.item_code`, [org_id, ids]);
    const oh = Object.fromEntries(onHand.map((r) => [r.product_id, r]));
    const dm = Object.fromEntries(demand.map((r) => [r.item_code, r]));
    const branches = await this._branchMap(conn, org_id);
    return products.map((p) => {
      const on_hand = q3(oh[p.product_id] ? oh[p.product_id].on_hand : 0);
      const reserved = q3(dm[p.product_id] ? dm[p.product_id].reserved : 0);
      const reorder = num(p.reorder_level);
      return {
        product_id: p.product_id, product_name: p.product_name, short_code: p.short_code, uom: p.uom,
        branch_id: p.producing_branch_id, branch_name: branches[p.producing_branch_id] ? branches[p.producing_branch_id].branch_name : p.producing_branch_id,
        on_hand, reserved, free: q3(on_hand - reserved), reorder_level: reorder,
        open_batches: oh[p.product_id] ? Number(oh[p.product_id].open_batches) : 0,
        next_best_before: oh[p.product_id] ? oh[p.product_id].next_best_before : null,
        low: reorder !== null && on_hand <= reorder,
        short: reserved > on_hand ? q3(reserved - on_hand) : 0,
        indents: dm[p.product_id] && dm[p.product_id].indents ? dm[p.product_id].indents.split(',') : [],
      };
    }).sort((a, b) => (b.short - a.short) || (Number(b.low) - Number(a.low)) || a.product_name.localeCompare(b.product_name));
  }

  async current(user, f = {}) {
    const conn = await this.getReadConnection();
    try {
      const branch = user.user_type === 'K' ? user.branch_id : f.branch_id || null;
      return ok({ stock: await this._stock(conn, user.org_id, branch) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // Daily movement: opening, added, dispatched, written off, adjusted, closing per product per day
  async daily(user, f = {}) {
    if (!isDate(f.from_date) || !isDate(f.to_date) || f.from_date > f.to_date) return fail(400, 'Choose a valid date range');
    if (moment(f.to_date).diff(moment(f.from_date), 'days') > 92) return fail(400, 'Choose at most 3 months');
    const conn = await this.getReadConnection();
    try {
      const branch = user.user_type === 'K' ? user.branch_id : f.branch_id || null;
      const params = [user.org_id];
      let where = 'm.org_id = ?';
      if (branch) { where += ' AND m.branch_id = ?'; params.push(branch); }
      if (f.product_id) { where += ' AND m.product_id = ?'; params.push(f.product_id); }
      const opening = await conn.query(
        `SELECT m.product_id, SUM(m.qty) AS qty FROM stock_movement m WHERE ${where} AND m.move_date < ? GROUP BY m.product_id`,
        [...params, f.from_date]);
      const moves = await conn.query(
        `SELECT m.product_id, DATE_FORMAT(m.move_date,'%Y-%m-%d') AS d,
                SUM(CASE WHEN m.move_type IN ('PRODUCE','OPENING') THEN m.qty ELSE 0 END) AS added,
                SUM(CASE WHEN m.move_type IN ('DISPATCH','REVERSAL') THEN -m.qty ELSE 0 END) AS dispatched,
                SUM(CASE WHEN m.move_type = 'WRITEOFF' THEN -m.qty ELSE 0 END) AS written_off,
                SUM(CASE WHEN m.move_type = 'ADJUST' THEN m.qty ELSE 0 END) AS adjusted
           FROM stock_movement m WHERE ${where} AND m.move_date BETWEEN ? AND ?
          GROUP BY m.product_id, m.move_date ORDER BY m.move_date`, [...params, f.from_date, f.to_date]);
      const products = await this._products(conn, user.org_id, null);
      const bal = Object.fromEntries(opening.map((o) => [o.product_id, q3(o.qty)]));
      const rows = [];
      const days = [];
      for (let d = moment(f.from_date); d.format('YYYY-MM-DD') <= f.to_date; d.add(1, 'day')) days.push(d.format('YYYY-MM-DD'));
      const ids = [...new Set([...Object.keys(bal), ...moves.map((m) => m.product_id)])];
      for (const day of days) {
        for (const id of ids) {
          const m = moves.find((x) => x.product_id === id && x.d === day);
          const open = bal[id] || 0;
          if (!m && !open) continue;
          const added = q3(m ? m.added : 0), dispatched = q3(m ? m.dispatched : 0);
          const written_off = q3(m ? m.written_off : 0), adjusted = q3(m ? m.adjusted : 0);
          const close = q3(open + added - dispatched - written_off + adjusted);
          bal[id] = close;
          rows.push({
            date: day, product_id: id, product_name: products[id] ? products[id].product_name : id, uom: products[id] && products[id].uom,
            opening: open, added, dispatched, written_off, adjusted, closing: close,
          });
        }
      }
      return ok({ rows });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // Alerts for home screens. Kitchen users: only products their branch produces.
  async alerts(user) {
    const conn = await this.getReadConnection();
    try {
      const branch = user.user_type === 'K' ? user.branch_id : null;
      const stock = await this._stock(conn, user.org_id, branch);
      const soon = moment(today()).add(EXPIRY_WARN_DAYS, 'days').format('YYYY-MM-DD');
      const params = [user.org_id, soon];
      let extra = '';
      if (branch) { extra = ' AND b.branch_id = ?'; params.push(branch); }
      const expiring = await conn.query(
        `SELECT b.batch_no, b.product_id, DATE_FORMAT(b.best_before,'%Y-%m-%d') AS best_before, b.qty_remaining, b.uom,
                (SELECT MAX(p.product_name) FROM product_master p WHERE p.org_id = b.org_id AND p.product_id = b.product_id) AS product_name
           FROM batch_master b WHERE b.org_id = ? AND b.status = 'O' AND b.qty_remaining > 0 AND b.best_before IS NOT NULL
            AND b.best_before <= ?${extra} ORDER BY b.best_before`, params);
      const t = today();
      return ok({
        shortfall: stock.filter((s) => s.short > 0),
        reorder: stock.filter((s) => s.low),
        expiring: expiring.map((e) => ({ ...e, qty_remaining: Number(e.qty_remaining), expired: e.best_before < t })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- reports ----------
  async wastage(org_id, f = {}) {
    if (!isDate(f.from_date) || !isDate(f.to_date)) return fail(400, 'Choose a valid date range');
    const conn = await this.getReadConnection();
    try {
      const rows = await conn.query(
        `SELECT DATE_FORMAT(m.move_date,'%Y-%m-%d') AS move_date, m.batch_no, m.product_id, -m.qty AS qty, m.note, m.created_by,
                b.uom, b.unit_cost, b.close_reason,
                (SELECT MAX(p.product_name) FROM product_master p WHERE p.org_id = m.org_id AND p.product_id = m.product_id) AS product_name
           FROM stock_movement m LEFT JOIN batch_master b ON b.org_id = m.org_id AND b.batch_no = m.batch_no
          WHERE m.org_id = ? AND m.move_type = 'WRITEOFF' AND m.move_date BETWEEN ? AND ? ORDER BY m.move_date DESC`,
        [org_id, f.from_date, f.to_date]);
      return ok({
        rows: rows.map((r) => ({
          ...r, qty: Number(r.qty), unit_cost: num(r.unit_cost),
          value: r.unit_cost !== null ? Math.round(Number(r.qty) * Number(r.unit_cost) * 100) / 100 : null,
          reason: CLOSE_REASONS[r.close_reason] || r.close_reason,
        })),
      });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  // ---------- product batch settings (Product Master) ----------
  async productSettings(org_id) {
    const conn = await this.getReadConnection();
    try {
      return ok({ products: Object.values(await this._products(conn, org_id, null)) });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async saveProductSettings(user, b) {
    const product_id = b && b.product_id;
    if (!product_id) return fail(400, 'product_id is required');
    const code = b.short_code ? String(b.short_code).trim().toUpperCase() : null;
    if (code && !/^[A-Z][A-Z0-9]{1,2}$/.test(code)) return fail(400, 'Short code must be 2 or 3 characters (letters or digits, starting with a letter)');
    const shelf = b.shelf_life_days === '' || b.shelf_life_days === null || b.shelf_life_days === undefined ? null : parseInt(b.shelf_life_days, 10);
    if (shelf !== null && !(shelf >= 0 && shelf <= 3650)) return fail(400, 'Shelf life must be 0-3650 days');
    const reorder = num(b.reorder_level);
    if (reorder !== null && !(reorder >= 0)) return fail(400, 'Reorder level must be 0 or more');
    const conn = await this.getReadConnection();
    try {
      if (code) {
        const dup = await conn.query(
          `SELECT product_name FROM product_master WHERE org_id = ? AND short_code = ? AND product_id <> ? LIMIT 1`, [user.org_id, code, product_id]);
        if (dup.length) return fail(400, `Short code ${code} is already used by ${dup[0].product_name}`);
      }
      if (b.producing_branch_id) {
        const [br] = await conn.query(`SELECT branch_type FROM branch_master WHERE org_id = ? AND branch_id = ?`, [user.org_id, b.producing_branch_id]);
        if (!br) return fail(400, 'Producing branch not found');
      }
      const r = await conn.query(
        `UPDATE product_master SET short_code = ?, producing_branch_id = ?, shelf_life_days = ?, default_taxable = ?, reorder_level = ?,
                updated_by = ?, updated_date = NOW() WHERE org_id = ? AND product_id = ?`,
        [code, b.producing_branch_id || null, shelf, b.default_taxable === 'N' ? 'N' : 'Y', reorder, user.user_id, user.org_id, product_id]);
      if (!r.affectedRows) return fail(404, 'Product not found');
      return ok({ message: 'Product settings saved' });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }
}

const batchModule = new BatchModule();
module.exports = { BatchModule, batchModule, CLOSE_REASONS };
