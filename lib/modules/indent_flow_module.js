// Indent change requests: the kitchen sends a requested indent back when stock is short (C -> Q),
// the branch edits it (change quantities, remove items, add other items) and resubmits (Q -> C).
// Also: which products a kitchen can be asked for (producing kitchen), used when an indent is created.
const BaseDao = require('../dao/base_dao');

const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const q3 = (n) => Math.round(Number(n) * 1000) / 1000;
const BRANCH_SCOPED = ['B', 'X'];

class IndentFlowModule extends BaseDao {
  // Products a kitchen produces: own producing kitchen, or (older products without one) the product's branch.
  async kitchenProducts(conn, org_id, kitchen_id, codes) {
    if (!codes.length) return {};
    const rows = await conn.query(
      `SELECT product_id, MAX(product_name) AS product_name, MAX(product_price) AS product_price,
              MAX(COALESCE(producing_branch_id, branch_id)) AS kitchen_id
         FROM product_master WHERE org_id = ? AND product_id IN (?) GROUP BY product_id`, [org_id, codes]);
    const out = {};
    for (const r of rows) out[r.product_id] = { ...r, ours: r.kitchen_id === kitchen_id };
    return out;
  }

  // Used on create: every item must be a product made by the chosen kitchen.
  async checkKitchenItems(org_id, kitchen_id, details) {
    const codes = (details || []).map((d) => d && d.item_code).filter(Boolean);
    if (!kitchen_id || !codes.length) return null;
    const conn = await this.getReadConnection();
    try {
      const p = await this.kitchenProducts(conn, org_id, kitchen_id, codes);
      const wrong = codes.filter((c) => !p[c] || !p[c].ours).map((c) => (p[c] ? p[c].product_name : c));
      return wrong.length ? `These items are not made by the selected kitchen: ${wrong.join(', ')}` : null;
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async _indent(conn, org_id, indent_number) {
    const [h] = await conn.query(
      `SELECT indent_number, branch_id, kitchen_id, status FROM indent_header WHERE org_id = ? AND indent_number = ? FOR UPDATE`,
      [org_id, indent_number]);
    return h || null;
  }

  // Kitchen: C -> Q. body: { indent_number, note, items: [{ item_code, qty_available, remark }] }
  async requestChange(user, body) {
    const indent_number = body && body.indent_number;
    const note = String((body && body.note) || '').trim().slice(0, 500);
    const flagged = (Array.isArray(body && body.items) ? body.items : [])
      .filter((i) => i && i.item_code && (String(i.remark || '').trim() || num(i.qty_available) !== null));
    if (!indent_number) return fail(400, 'indent_number is required');
    if (!note && !flagged.length) return fail(400, 'Mark the items that are short or add a note for the branch');
    for (const i of flagged) {
      const q = num(i.qty_available);
      if (q !== null && (isNaN(q) || q < 0)) return fail(400, 'Available quantity must be 0 or more');
    }
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const h = await this._indent(conn, user.org_id, indent_number);
      if (!h) { await conn.rollback(); return fail(404, 'Indent not found'); }
      if (user.user_type === 'K' && user.branch_id !== h.kitchen_id) { await conn.rollback(); return fail(403, 'This indent was sent to another kitchen'); }
      if (h.status !== 'C') { await conn.rollback(); return fail(409, 'Only a new (requested) indent can be sent back to the branch'); }
      await conn.query(
        `UPDATE indent_detail SET qty_agreed_kitchen = NULL, kitchen_remarks = NULL WHERE org_id = ? AND indent_number = ?`,
        [user.org_id, indent_number]);
      for (const i of flagged) {
        const q = num(i.qty_available);
        await conn.query(
          `UPDATE indent_detail SET qty_agreed_kitchen = ?, kitchen_remarks = ?, updated_by = ?, updated_date = NOW()
            WHERE org_id = ? AND indent_number = ? AND item_code = ?`,
          [q === null ? null : q3(q), String(i.remark || '').trim().slice(0, 1000) || (q === null ? null : `Only ${q3(q)} available`),
            user.user_id, user.org_id, indent_number, i.item_code]);
      }
      await conn.query(
        `UPDATE indent_header SET status = 'Q', kitchen_note = ?, change_requested_by = ?, change_requested_date = NOW(),
                updated_by = ?, updated_date = NOW() WHERE org_id = ? AND indent_number = ?`,
        [note || null, user.user_id, user.user_id, user.org_id, indent_number]);
      await conn.commit();
      return ok({ message: `Indent ${indent_number} sent back to the branch for changes` });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }

  // Branch: Q -> C. body: { indent_number, items: [{ item_code, qty_ordered, mandatory_status }] } = the full new list.
  async resubmit(user, body) {
    const indent_number = body && body.indent_number;
    const items = Array.isArray(body && body.items) ? body.items : [];
    if (!indent_number) return fail(400, 'indent_number is required');
    if (!items.length) return fail(400, 'Keep at least one item in the indent');
    const seen = new Set();
    for (const i of items) {
      if (!i || !i.item_code) return fail(400, 'Each line needs an item');
      if (seen.has(i.item_code)) return fail(400, 'An item appears twice; keep one line per item');
      seen.add(i.item_code);
      const q = num(i.qty_ordered);
      if (!(q > 0) || q > 1000000) return fail(400, 'Enter a quantity greater than 0 for every item');
    }
    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      const h = await this._indent(conn, user.org_id, indent_number);
      if (!h) { await conn.rollback(); return fail(404, 'Indent not found'); }
      if (BRANCH_SCOPED.includes(user.user_type) && user.branch_id !== h.branch_id) { await conn.rollback(); return fail(403, 'You do not have access to this indent'); }
      if (h.status !== 'Q') { await conn.rollback(); return fail(409, 'This indent is not waiting for your changes'); }

      const codes = items.map((i) => i.item_code);
      const products = await this.kitchenProducts(conn, user.org_id, h.kitchen_id, codes);
      const wrong = codes.filter((c) => !products[c] || !products[c].ours).map((c) => (products[c] ? products[c].product_name : c));
      if (wrong.length) { await conn.rollback(); return fail(400, `These items are not made by this kitchen: ${wrong.join(', ')}`); }

      const current = await conn.query(
        `SELECT item_code, item_cost, DATE_FORMAT(indent_date,'%Y-%m-%d') AS indent_date FROM indent_detail WHERE org_id = ? AND indent_number = ?`,
        [user.org_id, indent_number]);
      const byCode = Object.fromEntries(current.map((c) => [c.item_code, c]));
      const removed = current.filter((c) => !seen.has(c.item_code)).map((c) => c.item_code);
      if (removed.length) {
        await conn.query(`DELETE FROM indent_detail WHERE org_id = ? AND indent_number = ? AND item_code IN (?)`,
          [user.org_id, indent_number, removed]);
      }
      const indentDate = (current[0] && current[0].indent_date) || null;
      let total = 0;
      for (const i of items) {
        const qty = q3(i.qty_ordered);
        const mandatory = i.mandatory_status === 'Y' ? 'Y' : 'N';
        const ex = byCode[i.item_code];
        if (ex) {
          const cost = Number(ex.item_cost) || 0;
          total += qty * cost;
          await conn.query(
            `UPDATE indent_detail SET qty_ordered = ?, mandatory_status = ?, net_value = ?, qty_agreed_kitchen = NULL, kitchen_remarks = NULL,
                    updated_by = ?, updated_date = NOW() WHERE org_id = ? AND indent_number = ? AND item_code = ?`,
            [qty, mandatory, qty * cost, user.user_id, user.org_id, indent_number, i.item_code]);
        } else {
          const cost = Number(products[i.item_code].product_price) || 0;
          total += qty * cost;
          await conn.query(`INSERT INTO indent_detail SET ?`, [{
            org_id: user.org_id, branch_id: h.branch_id, indent_number, indent_date: indentDate, kitchen_id: h.kitchen_id,
            item_code: i.item_code, qty_ordered: qty, item_cost: cost, net_value: qty * cost, mandatory_status: mandatory,
            created_by: user.user_id, created_date: new Date(), updated_by: user.user_id, updated_date: new Date(),
          }]);
        }
      }
      await conn.query(
        `UPDATE indent_header SET status = 'C', value = ?, updated_by = ?, updated_date = NOW() WHERE org_id = ? AND indent_number = ?`,
        [Math.round(total * 100) / 100, user.user_id, user.org_id, indent_number]);
      await conn.commit();
      return ok({ message: `Indent ${indent_number} sent to the kitchen again` });
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
  }
}

module.exports = { indentFlow: new IndentFlowModule() };
