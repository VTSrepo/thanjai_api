// Product Master bulk update from an Excel list (e.g. "Food Order List": Item Name, Unit Size, COST, CODE).
// Matches existing products by short code, then by name; updates changed fields, adds new products.
// Products not in the file are only reported (never deleted: old indents and invoices refer to them).
// preview = true returns the plan without saving.
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message, extra) => ({ status, code: status * 10, message, developerMessage: message, ...extra });
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();
const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
const CODE_RE = /^[A-Z][A-Z0-9]{1,2}$/;

class ProductImportModule extends BaseDao {
  async _nextProductId(conn) {
    await conn.query(`INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no, branch_pad) VALUES ('PRD', '', 0, 'Y')`);
    await conn.query(`UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1) WHERE seq_type = 'PRD'`);
    const [r] = await conn.query(`SELECT CONCAT(seq_type, branch_id, LPAD(LAST_INSERT_ID(), 6, '0')) AS id FROM vts_seq_generator WHERE seq_type = 'PRD' LIMIT 1`);
    return r.id;
  }

  async run(user, body) {
    const rows = Array.isArray(body && body.rows) ? body.rows : [];
    const defaults = (body && body.defaults) || {};
    const preview = body && body.preview !== false;
    if (!rows.length) return fail(400, 'The file has no product rows');
    if (rows.length > 2000) return fail(400, 'At most 2000 products per file');

    const conn = preview ? await this.getReadConnection() : await this.getWriteConnection();
    try {
      if (!preview) await conn.begintransaction();
      const existingRows = await conn.query(
        `SELECT product_id, MAX(product_name) AS product_name, MAX(uom) AS uom, MAX(product_price) AS product_price,
                MAX(short_code) AS short_code, MAX(COALESCE(producing_branch_id, branch_id)) AS producing_branch_id, MAX(producing_branch_id) AS own_kitchen,
                MAX(shelf_life_days) AS shelf_life_days, MAX(default_taxable) AS default_taxable
           FROM product_master WHERE org_id = ? GROUP BY product_id`, [user.org_id]);
      const openBatches = Object.fromEntries((await conn.query(
        `SELECT product_id, COUNT(*) AS n FROM batch_master WHERE org_id = ? AND status = 'O' GROUP BY product_id`, [user.org_id]))
        .map((b) => [b.product_id, Number(b.n)]));
      const branches = await conn.query(`SELECT branch_id, branch_name, short_code, branch_type FROM branch_master WHERE org_id = ?`, [user.org_id]);
      const kitchenFor = (v) => {
        const s = norm(v);
        if (!s) return null;
        const b = branches.find((x) => norm(x.branch_id) === s || norm(x.short_code) === s || norm(x.branch_name) === s);
        return b ? b.branch_id : undefined; // undefined = not found
      };
      if (defaults.producing_branch_id && !branches.some((b) => b.branch_id === defaults.producing_branch_id)) {
        return fail(400, 'Default producing kitchen not found');
      }
      const byCode = Object.fromEntries(existingRows.filter((p) => p.short_code).map((p) => [norm(p.short_code), p]));
      const byName = Object.fromEntries(existingRows.map((p) => [norm(p.product_name), p]));

      const errors = [];
      const plan = [];
      const seenCodes = {};
      const seenNames = {};
      const matched = new Set();
      rows.forEach((r, i) => {
        const line = r.excel_row || i + 2;
        const name = norm(r.name);
        const code = norm(r.code);
        if (!name && !code) return;
        if (!name) return errors.push({ row: line, message: 'Item name is missing' });
        if (name.length > 500) return errors.push({ row: line, message: 'Item name is too long' });
        if (!CODE_RE.test(code)) return errors.push({ row: line, message: `${name}: code "${r.code || ''}" must be 2-3 characters (letters/digits, starting with a letter)` });
        if (seenCodes[code]) return errors.push({ row: line, message: `${name}: code ${code} is also used on row ${seenCodes[code]}` });
        if (seenNames[name]) return errors.push({ row: line, message: `${name} appears twice (rows ${seenNames[name]} and ${line})` });
        seenCodes[code] = line;
        seenNames[name] = line;
        const price = num(r.price);
        if (r.price !== null && r.price !== undefined && r.price !== '' && (price === null || price < 0)) {
          return errors.push({ row: line, message: `${name}: price must be a number, 0 or more` });
        }
        const uom = r.uom ? String(r.uom).trim().toUpperCase().slice(0, 100) : null;
        let kitchen = null;
        if (r.kitchen) {
          kitchen = kitchenFor(r.kitchen);
          if (kitchen === undefined) return errors.push({ row: line, message: `${name}: kitchen "${r.kitchen}" not found (use its short code or name)` });
        }
        const shelf = r.shelf_life_days === null || r.shelf_life_days === undefined || r.shelf_life_days === '' ? null : parseInt(r.shelf_life_days, 10);
        const taxable = r.taxable ? (/^(N|NO|NON|EXEMPT|NON-TAXABLE)/i.test(String(r.taxable)) ? 'N' : 'Y') : null;

        const ex = byCode[code] || byName[name];
        if (ex) {
          if (matched.has(ex.product_id)) return errors.push({ row: line, message: `${name}: matches ${ex.product_name} which is already on another row` });
          const clash = byCode[code] && byCode[code].product_id !== ex.product_id;
          if (clash) return errors.push({ row: line, message: `${name}: code ${code} already belongs to ${byCode[code].product_name}` });
          matched.add(ex.product_id);
          const set = {};
          const changes = [];
          const diff = (field, label, value, from) => {
            if (value === null || value === undefined) return;
            if (String(from ?? '') !== String(value)) { set[field] = value; changes.push(`${label}: ${from ?? '-'} → ${value}`); }
          };
          diff('product_name', 'Name', name, norm(ex.product_name) === name ? name : ex.product_name);
          diff('short_code', 'Code', code, ex.short_code);
          const codeNote = set.short_code && ex.short_code && openBatches[ex.product_id]
            ? `${openBatches[ex.product_id]} open batch(es) keep their ${ex.short_code} numbers; new batches use ${code}` : null;
          diff('uom', 'Unit', uom, ex.uom);
          if (price !== null && Number(ex.product_price) !== price) { set.product_price = price; changes.push(`Price: ${ex.product_price ?? '-'} → ${price}`); }
          // products saved before batches existed have no kitchen of their own (they fall back to their branch): record it now
          const newKitchen = kitchen || (!ex.own_kitchen ? defaults.producing_branch_id || ex.producing_branch_id : null);
          diff('producing_branch_id', 'Kitchen', newKitchen, ex.own_kitchen);
          if (shelf !== null && !isNaN(shelf)) diff('shelf_life_days', 'Shelf life', shelf, ex.shelf_life_days);
          diff('default_taxable', 'Tax', taxable, ex.default_taxable);
          plan.push({ row: line, action: changes.length ? 'update' : 'same', product_id: ex.product_id, name, code, uom, price, changes, set,
            producing_branch_id: set.producing_branch_id || ex.producing_branch_id, note: codeNote });
        } else {
          const k = kitchen || defaults.producing_branch_id || null;
          plan.push({
            row: line, action: 'new', name, code, uom, price, producing_branch_id: k,
            shelf_life_days: shelf !== null && !isNaN(shelf) ? shelf : null, default_taxable: taxable || 'Y',
            changes: [`New product${k ? ` (kitchen ${k})` : ''}`],
          });
        }
      });
      const notInFile = existingRows.filter((p) => !matched.has(p.product_id))
        .map((p) => ({ product_id: p.product_id, product_name: p.product_name, short_code: p.short_code }));
      const summary = {
        new: plan.filter((p) => p.action === 'new').length,
        update: plan.filter((p) => p.action === 'update').length,
        same: plan.filter((p) => p.action === 'same').length,
        not_in_file: notInFile.length,
      };
      if (errors.length) {
        if (!preview) await conn.rollback();
        return fail(400, `${errors.length} row(s) need fixing. Nothing was saved.`, { errors, plan, summary, not_in_file: notInFile });
      }
      if (preview) return ok({ plan, summary, not_in_file: notInFile });
      if (plan.some((p) => p.action === 'new') && !defaults.producing_branch_id && plan.some((p) => p.action === 'new' && !p.producing_branch_id)) {
        await conn.rollback();
        return fail(400, 'Choose a default producing kitchen for the new products');
      }

      // ---- apply ----
      const now = new Date();
      const today = moment().tz(TZ).format('YYYY-MM-DD');
      const yesterday = moment().tz(TZ).subtract(1, 'day').format('YYYY-MM-DD');
      const setPrice = async (product_id, branch_id, price, name) => {
        // close the open price and start a new one today (keeps price history for older indents)
        await conn.query(
          `UPDATE prod_selling_price_master SET eff_to = ?, updated_by = ?, updated_date = ?
            WHERE org_id = ? AND product_id = ? AND eff_to IS NULL AND eff_from < ?`,
          [yesterday, user.user_id, now, user.org_id, product_id, today]);
        await conn.query(
          `INSERT INTO prod_selling_price_master (org_id, branch_id, product_id, product_price, eff_from, active_flag, prod_name_invoice,
                  created_by, created_date, updated_by, updated_date)
           VALUES (?, ?, ?, ?, ?, 'Y', ?, ?, ?, NULL, NULL)
           ON DUPLICATE KEY UPDATE product_price = VALUES(product_price), eff_to = NULL`,
          [user.org_id, branch_id, product_id, price, today, name, user.user_id, now]);
      };
      const uoms = new Set();
      for (const p of plan) {
        if (p.uom) uoms.add(p.uom);
        if (p.action === 'update') {
          await conn.query(`UPDATE product_master SET ?, updated_by = ?, updated_date = ? WHERE org_id = ? AND product_id = ?`,
            [p.set, user.user_id, now, user.org_id, p.product_id]);
          if (p.set.product_price !== undefined) {
            const [row] = await conn.query(`SELECT branch_id FROM product_master WHERE org_id = ? AND product_id = ? LIMIT 1`, [user.org_id, p.product_id]);
            await setPrice(p.product_id, row.branch_id, p.set.product_price, p.name);
          }
        } else if (p.action === 'new') {
          let id = await this._nextProductId(conn);
          // never reuse an id that already exists
          // eslint-disable-next-line no-await-in-loop
          while ((await conn.query(`SELECT 1 FROM product_master WHERE org_id = ? AND product_id = ?`, [user.org_id, id])).length) id = await this._nextProductId(conn);
          p.product_id = id;
          const branch_id = p.producing_branch_id;
          await conn.query(`INSERT INTO product_master SET ?`, [{
            org_id: user.org_id, branch_id, product_id: id, product_name: p.name, short_code: p.code, producing_branch_id: branch_id,
            uom: p.uom, product_price: p.price ?? 0, shelf_life_days: p.shelf_life_days, default_taxable: p.default_taxable,
            category_code: defaults.category_code || null, bu_id: defaults.bu_id || null,
            stock_in_hand: 0, min_stock: 0, max_stock: 0, reorder_level: 0,
            created_by: user.user_id, created_date: now, updated_by: user.user_id, updated_date: now,
          }]);
          await setPrice(id, branch_id, p.price ?? 0, p.name);
        }
      }
      // units used in the file become choices in the Product form's UOM list
      for (const u of uoms) {
        await conn.query(
          `INSERT INTO vts_ref_master (ref_type, ref_code, ref_desc) SELECT 'UOM', ?, ? FROM DUAL
            WHERE NOT EXISTS (SELECT 1 FROM vts_ref_master WHERE ref_type = 'UOM' AND UPPER(TRIM(ref_code)) = ?)`, [u, u, u]);
      }
      await conn.commit();
      return ok({ message: `${summary.new} added, ${summary.update} updated, ${summary.same} unchanged`, plan, summary, not_in_file: notInFile });
    } catch (err) {
      if (!preview) { try { await conn.rollback(); } catch (e) {} }
      throw err;
    } finally {
      if (preview) await this.releaseReadConnection(conn); else await this.releaseWriteConnection(conn);
    }
  }
}

module.exports = { productImport: new ProductImportModule() };
