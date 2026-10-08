// Indent invoicing: kitchen (seller) bills the ordering branch for what the branch received.
// All SQL uses ? placeholders.
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');
const { isTerm, normTerm, termLabel, dueDateFor, DEFAULT_TERM } = require('../../common/terms');

const TZ = process.env.INVOICE_TZ || 'America/Toronto'; // Montreal local date for invoice dates

// Fallback rates when the seller branch has none saved (2026, TaxTips.ca). gst = GST or HST.
const PROVINCE = {
    QC: { name: 'Quebec', gst: 5, qst: 9.975, label: 'GST' }, ON: { name: 'Ontario', gst: 13, qst: 0, label: 'HST' },
    AB: { name: 'Alberta', gst: 5, qst: 0, label: 'GST' }, BC: { name: 'British Columbia', gst: 5, qst: 0, label: 'GST' },
    MB: { name: 'Manitoba', gst: 5, qst: 0, label: 'GST' }, NB: { name: 'New Brunswick', gst: 15, qst: 0, label: 'HST' },
    NL: { name: 'Newfoundland and Labrador', gst: 15, qst: 0, label: 'HST' }, NS: { name: 'Nova Scotia', gst: 14, qst: 0, label: 'HST' },
    NT: { name: 'Northwest Territories', gst: 5, qst: 0, label: 'GST' }, NU: { name: 'Nunavut', gst: 5, qst: 0, label: 'GST' },
    PE: { name: 'Prince Edward Island', gst: 15, qst: 0, label: 'HST' }, SK: { name: 'Saskatchewan', gst: 5, qst: 0, label: 'GST' },
    YT: { name: 'Yukon', gst: 5, qst: 0, label: 'GST' },
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const fail = (status, message) => ({ status, code: status * 10, message, developerMessage: message });

function party(b) {
    if (!b) return null;
    const prov = PROVINCE[b.province_code] || null;
    return {
        branch_id: b.branch_id,
        name: b.legal_name || b.branch_name,
        branch_name: b.branch_name,
        address: b.branch_address || null,
        city: b.branch_city || null,
        province: prov ? prov.name : b.province_code || null,
        postal_code: b.postal_code || null,
        country: 'Canada',
        email: b.branch_email_id || null,
        phone: b.branch_contact_num || null,
        gst_hst_reg_no: b.gst_hst_reg_no || null,
        qst_reg_no: b.qst_reg_no || null,
    };
}

// Seller tax: saved branch rates, else province defaults.
function taxFor(seller) {
    const prov = PROVINCE[seller && seller.province_code] || null;
    const gst = num(seller && seller.gst_hst_rate) ?? (prov ? prov.gst : 0);
    const qst = num(seller && seller.qst_rate) ?? (prov ? prov.qst : 0);
    const label = prov ? prov.label : 'GST';
    return { gst_rate: gst, qst_rate: qst, gst_label: label };
}

// Invoice qty = received, else agreed by kitchen, else ordered.
const billQty = (d) => num(d.qty_received) ?? num(d.qty_agreed_kitchen) ?? num(d.qty_ordered) ?? 0;

class InvoiceModule extends BaseDao {

    async _branches(conn, org_id, ids) {
        if (!ids.length) return {};
        const rows = await conn.query(`SELECT * FROM branch_master WHERE org_id = ? AND branch_id IN (?)`, [org_id, ids]);
        return Object.fromEntries(rows.map((b) => [b.branch_id, b]));
    }

    // Lines with price: latest active selling price on/before the indent date, else product_master price.
    async _lines(conn, org_id, indent) {
        const pm = (col) => `(SELECT p.${col} FROM product_master p WHERE p.org_id = d.org_id AND p.product_id = d.item_code
                               ORDER BY (p.branch_id = d.kitchen_id) DESC LIMIT 1)`;
        const rows = await conn.query(
            `SELECT d.item_code, d.qty_ordered, d.qty_agreed_kitchen, d.qty_received, d.tax_flag,
                    ${pm('product_name')} AS product_name, ${pm('prod_name_invoice')} AS prod_name_invoice,
                    ${pm('uom')} AS uom, ${pm('product_price')} AS product_price,
                    (SELECT s.product_price FROM prod_selling_price_master s
                      WHERE s.org_id = d.org_id AND s.product_id = d.item_code
                        AND s.eff_from <= ? AND (s.eff_to IS NULL OR s.eff_to >= ?)
                        AND (s.active_flag IS NULL OR s.active_flag <> 'I')
                      ORDER BY s.eff_from DESC LIMIT 1) AS selling_price,
                    (SELECT s.prod_name_invoice FROM prod_selling_price_master s
                      WHERE s.org_id = d.org_id AND s.product_id = d.item_code AND s.prod_name_invoice IS NOT NULL
                      ORDER BY s.eff_from DESC LIMIT 1) AS sp_invoice_name
               FROM indent_detail d
              WHERE d.org_id = ? AND d.indent_number = ? AND d.kitchen_id = ?
              ORDER BY d.item_code`,
            [indent.indent_date || moment().format('YYYY-MM-DD'), indent.indent_date || moment().format('YYYY-MM-DD'),
             org_id, indent.indent_number, indent.kitchen_id]);
        return rows.map((r) => {
            const rate = num(r.selling_price) ?? num(r.product_price);
            const qty = billQty(r);
            return {
                item_code: r.item_code,
                item_name: r.sp_invoice_name || r.prod_name_invoice || r.product_name || r.item_code,
                uom: r.uom,
                qty,
                qty_ordered: num(r.qty_ordered),
                rate,
                amount: rate === null ? null : r2(qty * rate),
                taxable: r.tax_flag !== 'N', // admin decides per item; default taxable
            };
        }).filter((l) => l.qty > 0);
    }

    // Extra charge lines the admin added (delivery charge etc.), shaped like invoice lines
    async _charges(conn, org_id, indent) {
        const rows = await conn.query(
            `SELECT line_no, description, amount, taxable FROM indent_charge
              WHERE org_id = ? AND indent_number = ? AND kitchen_id = ? ORDER BY line_no`,
            [org_id, indent.indent_number, indent.kitchen_id]);
        return rows.map((c) => ({
            item_code: 'CHG' + String(c.line_no).padStart(2, '0'),
            item_name: c.description, uom: null, qty: 1,
            rate: Number(c.amount), amount: r2(c.amount), taxable: c.taxable === 'Y', charge: true,
        }));
    }

    // GST/QST only on taxable lines
    _totals(lines, tax) {
        const sub_total = r2(lines.reduce((s, l) => s + (l.amount || 0), 0));
        const taxable_total = r2(lines.filter((l) => l.taxable !== false).reduce((s, l) => s + (l.amount || 0), 0));
        const gst_amount = r2(taxable_total * (tax.gst_rate || 0) / 100);
        const qst_amount = r2(taxable_total * (tax.qst_rate || 0) / 100);
        const total_amount = r2(sub_total + gst_amount + qst_amount);
        return { sub_total, taxable_total, gst_amount, qst_amount, total_amount };
    }

    // Report: all indents in the date range (optionally one ordering branch) with invoice / preview amounts.
    async listIndents(org_id, { from_date, to_date, branch_id }) {
        const conn = await this.getReadConnection();
        try {
            const params = [org_id, from_date, to_date];
            let where = `h.org_id = ? AND h.indent_date BETWEEN ? AND ?`;
            if (branch_id) { where += ` AND h.branch_id = ?`; params.push(branch_id); }
            const indents = await conn.query(
                `SELECT h.org_id, h.indent_number, h.branch_id, h.kitchen_id, h.status, h.self_customer, h.customer_name,
                        h.priority_flag, DATE_FORMAT(h.indent_date,'%Y-%m-%d') AS indent_date, h.delivery_by_datetime,
                        CASE WHEN h.status = 'R' THEN DATE_FORMAT(h.updated_date,'%Y-%m-%d') END AS received_date,
                        b.branch_name, k.branch_name AS kitchen_name,
                        (SELECT COUNT(*) FROM indent_detail d WHERE d.org_id = h.org_id AND d.indent_number = h.indent_number
                            AND d.kitchen_id = h.kitchen_id) AS item_count,
                        i.invoice_number, DATE_FORMAT(i.invoice_date,'%Y-%m-%d') AS invoice_date,
                        i.sub_total, i.gst_amount, i.qst_amount, i.total_amount, i.amount_paid, i.balance_due,
                        i.status AS invoice_status, DATE_FORMAT(i.due_date,'%Y-%m-%d') AS due_date,
                        CASE WHEN i.balance_due > 0 AND i.due_date < CURDATE() THEN 1 ELSE 0 END AS overdue
                   FROM indent_header h
                   LEFT JOIN branch_master b ON b.org_id = h.org_id AND b.branch_id = h.branch_id
                   LEFT JOIN branch_master k ON k.org_id = h.org_id AND k.branch_id = h.kitchen_id
                   LEFT JOIN invoice_header i ON i.org_id = h.org_id AND i.indent_number = h.indent_number AND i.kitchen_id = h.kitchen_id
                  WHERE ${where}
                  ORDER BY h.indent_date DESC, h.indent_number DESC`, params);

            const kitchens = await this._branches(conn, org_id, [...new Set(indents.map((i) => i.kitchen_id))]);
            for (const ind of indents) {
                if (ind.invoice_number) {
                    ['sub_total', 'gst_amount', 'qst_amount', 'total_amount', 'amount_paid', 'balance_due'].forEach((k) => (ind[k] = Number(ind[k])));
                    ind.overdue = !!ind.overdue;
                    ind.preview = false;
                    continue;
                }
                // Not invoiced yet: estimate from current prices so the user sees the value.
                const lines = [...(await this._lines(conn, org_id, ind)), ...(await this._charges(conn, org_id, ind))];
                const t = this._totals(lines, taxFor(kitchens[ind.kitchen_id]));
                delete t.taxable_total;
                Object.assign(ind, t, { preview: true, price_missing: lines.filter((l) => l.rate === null).map((l) => l.item_name) });
            }
            return { status: 200, code: 200, message: 'Success', developerMessage: 'Success', indents };
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    async getInvoice(org_id, invoice_number) {
        const conn = await this.getReadConnection();
        try {
            return await this._load(conn, org_id, invoice_number);
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    async _load(conn, org_id, invoice_number) {
        const [h] = await conn.query(
            `SELECT *, DATE_FORMAT(invoice_date,'%Y-%m-%d') AS invoice_date, DATE_FORMAT(due_date,'%Y-%m-%d') AS due_date
               FROM invoice_header WHERE org_id = ? AND invoice_number = ?`, [org_id, invoice_number]);
        if (!h) return fail(404, 'Invoice not found');
        const lines = await conn.query(
            `SELECT line_no, item_code, item_name, uom, qty, rate, amount, taxable FROM invoice_detail
              WHERE org_id = ? AND invoice_number = ? ORDER BY line_no`, [org_id, invoice_number]);
        const payments = await conn.query(
            `SELECT payment_id, receipt_no, DATE_FORMAT(payment_date,'%Y-%m-%d') AS payment_date, amount, mode, reference
               FROM invoice_payment WHERE org_id = ? AND invoice_number = ? AND voided = 'N' ORDER BY payment_date, payment_id`,
            [org_id, invoice_number]);
        h.payments = payments.map((p) => ({ ...p, amount: Number(p.amount) }));
        const numeric = ['sub_total', 'gst_rate', 'gst_amount', 'qst_rate', 'qst_amount', 'total_amount', 'amount_paid', 'balance_due'];
        numeric.forEach((k) => (h[k] = num(h[k])));
        const invoice = {
            ...h,
            seller: h.seller_info ? JSON.parse(h.seller_info) : null,
            bill_to: h.bill_to_info ? JSON.parse(h.bill_to_info) : null,
            lines: lines.map((l) => ({ ...l, qty: Number(l.qty), rate: Number(l.rate), amount: Number(l.amount), taxable: l.taxable !== 'N' })),
        };
        delete invoice.seller_info;
        delete invoice.bill_to_info;
        return { status: 200, code: 200, message: 'Success', developerMessage: 'Success', invoice };
    }

    async _nextNumber(conn, org_id) {
        await conn.query(
            `INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES ('INV', ?, 0)`, [org_id]);
        await conn.query(
            `UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1)
              WHERE seq_type = 'INV' AND branch_id = ?`, [org_id]);
        const [row] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
        return 'INV-' + String(row.n).padStart(6, '0');
    }

    // Idempotent: returns the existing invoice if this indent already has one.
    async generate(org_id, indent_number, user_id) {
        if (!org_id || !indent_number) return fail(400, 'org_id and indent_number are required');
        const conn = await this.getReadConnection();
        try {
            const [indent] = await conn.query(
                `SELECT *, DATE_FORMAT(indent_date,'%Y-%m-%d') AS indent_date FROM indent_header
                  WHERE org_id = ? AND indent_number = ?`, [org_id, indent_number]);
            if (!indent) return fail(404, 'Indent not found');

            const [existing] = await conn.query(
                `SELECT invoice_number FROM invoice_header WHERE org_id = ? AND indent_number = ? AND kitchen_id = ?`,
                [org_id, indent_number, indent.kitchen_id]);
            if (existing) return await this._load(conn, org_id, existing.invoice_number);

            if (indent.status !== 'R') return fail(400, 'Invoice can be generated only after the branch confirms receipt');

            const items = await this._lines(conn, org_id, indent);
            if (!items.length) return fail(400, 'Nothing was received on this indent, so there is nothing to invoice');
            const lines = [...items, ...(await this._charges(conn, org_id, indent))];
            const missing = lines.filter((l) => l.rate === null).map((l) => l.item_name);
            if (missing.length) return fail(400, `Set a price in Product Master for: ${missing.join(', ')}`);

            const br = await this._branches(conn, org_id, [indent.kitchen_id, indent.branch_id]);
            const sellerRow = br[indent.kitchen_id];
            const tax = taxFor(sellerRow);
            const t = this._totals(lines, tax);
            delete t.taxable_total;
            const today = moment().tz(TZ);
            const invoiceDate = today.format('YYYY-MM-DD');
            // term chosen by admin at invoice setup, else the billed customer's default term
            const term = normTerm(indent.inv_credit_term || (br[indent.branch_id] && br[indent.branch_id].credit_term));
            const invoice_number = await this._nextNumber(conn, org_id);
            const notes = [
                sellerRow && sellerRow.invoice_notes,
                `Indent ${indent.indent_number}` + (indent.self_customer === 'C' && indent.customer_name ? ` - customer order: ${indent.customer_name}` : ''),
            ].filter(Boolean).join('\n');

            await conn.query(`INSERT INTO invoice_header SET ?`, [{
                org_id, invoice_number, indent_number, branch_id: indent.branch_id, kitchen_id: indent.kitchen_id,
                invoice_date: invoiceDate, due_date: dueDateFor(term, invoiceDate),
                terms: termLabel(term), credit_term: term, amount_paid: 0, ...t, gst_label: tax.gst_label, gst_rate: tax.gst_rate, qst_rate: tax.qst_rate,
                balance_due: t.total_amount,
                seller_info: JSON.stringify(party(sellerRow)), bill_to_info: JSON.stringify(party(br[indent.branch_id])),
                notes, status: 'O', created_by: user_id || null, created_date: new Date(),
            }]);
            const detail = lines.map((l, i) => [org_id, invoice_number, i + 1, l.item_code, l.item_name, l.uom, l.qty, l.rate, l.amount,
                l.taxable === false ? 'N' : 'Y']);
            await conn.query(
                `INSERT INTO invoice_detail (org_id, invoice_number, line_no, item_code, item_name, uom, qty, rate, amount, taxable) VALUES ?`,
                [detail]);
            return await this._load(conn, org_id, invoice_number);
        } catch (err) {
            if (err && err.code === 'ER_DUP_ENTRY') {
                // Generated concurrently by another request: return that one.
                const [ex] = await conn.query(`SELECT invoice_number FROM invoice_header WHERE org_id = ? AND indent_number = ?`, [org_id, indent_number]);
                if (ex) return await this._load(conn, org_id, ex.invoice_number);
            }
            throw err;
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    // ---- Invoice setup: admin decides per-item tax, payment terms and extra charges before dispatch ----
    async getSetup(org_id, indent_number) {
        const conn = await this.getReadConnection();
        try {
            const [indent] = await conn.query(
                `SELECT h.*, DATE_FORMAT(h.indent_date,'%Y-%m-%d') AS indent_date, DATE_FORMAT(h.delivery_date,'%Y-%m-%d') AS delivery_date,
                        b.branch_name, b.legal_name, b.branch_type, b.credit_term AS default_term, k.branch_name AS kitchen_name
                   FROM indent_header h
                   LEFT JOIN branch_master b ON b.org_id = h.org_id AND b.branch_id = h.branch_id
                   LEFT JOIN branch_master k ON k.org_id = h.org_id AND k.branch_id = h.kitchen_id
                  WHERE h.org_id = ? AND h.indent_number = ? LIMIT 1`, [org_id, indent_number]);
            if (!indent) return fail(404, 'Indent not found');
            const br = await this._branches(conn, org_id, [indent.kitchen_id]);
            const tax = taxFor(br[indent.kitchen_id]);
            const items = await this._lines(conn, org_id, indent);
            const charges = await this._charges(conn, org_id, indent);
            const default_term = normTerm(indent.default_term || DEFAULT_TERM);
            const credit_term = normTerm(indent.inv_credit_term || default_term);
            return {
                status: 200, code: 200, message: 'Success', developerMessage: 'Success',
                setup: {
                    indent_number: indent.indent_number, status: indent.status, indent_date: indent.indent_date,
                    delivery_date: indent.delivery_date, branch_id: indent.branch_id,
                    bill_to_name: indent.legal_name || indent.branch_name, branch_type: indent.branch_type,
                    kitchen_name: indent.kitchen_name, finalized: !!indent.inv_finalized_date,
                    editable: ['A', 'F'].includes(indent.status),
                    default_term, credit_term, credit_term_label: termLabel(credit_term),
                    ...tax,
                    items: items.map(({ item_code, item_name, uom, qty, qty_ordered, rate, amount, taxable }) =>
                        ({ item_code, item_name, uom, qty, qty_ordered, rate, amount, taxable })),
                    charges: charges.map(({ item_name, amount, taxable }) => ({ description: item_name, amount, taxable })),
                    totals: this._totals([...items, ...charges], tax),
                    price_missing: items.filter((l) => l.rate === null).map((l) => l.item_name),
                },
            };
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    async saveSetup(user, body) {
        const org_id = user.org_id;
        const { indent_number, credit_term, finalize } = body || {};
        if (!indent_number) return fail(400, 'indent_number is required');
        if (!isTerm(credit_term)) return fail(400, 'Choose a valid payment term (custom Net days: 1-365)');
        const items = Array.isArray(body.items) ? body.items : [];
        const charges = (Array.isArray(body.charges) ? body.charges : [])
            .map((c) => ({ description: String(c.description || '').trim(), amount: num(c.amount), taxable: c.taxable ? 'Y' : 'N' }))
            .filter((c) => c.description || c.amount);
        if (charges.length > 20) return fail(400, 'At most 20 extra charge lines');
        for (const c of charges) {
            if (!c.description || c.description.length > 200) return fail(400, 'Each extra charge needs a description (up to 200 characters)');
            if (!(c.amount > 0) || c.amount > 10000000) return fail(400, `Enter a valid amount for "${c.description}"`);
        }

        const conn = await this.getWriteConnection();
        try {
            await conn.begintransaction();
            const [indent] = await conn.query(
                `SELECT indent_number, kitchen_id, status FROM indent_header WHERE org_id = ? AND indent_number = ? FOR UPDATE`,
                [org_id, indent_number]);
            if (!indent) { await conn.rollback(); return fail(404, 'Indent not found'); }
            if (!['A', 'F'].includes(indent.status)) {
                await conn.rollback();
                return fail(400, indent.status === 'C'
                    ? 'The kitchen must accept this indent first'
                    : 'This indent is already dispatched; invoice settings can no longer change');
            }
            for (const it of items) {
                await conn.query(
                    `UPDATE indent_detail SET tax_flag = ? WHERE org_id = ? AND indent_number = ? AND kitchen_id = ? AND item_code = ?`,
                    [it.taxable === false ? 'N' : 'Y', org_id, indent_number, indent.kitchen_id, it.item_code]);
            }
            await conn.query(`DELETE FROM indent_charge WHERE org_id = ? AND indent_number = ? AND kitchen_id = ?`,
                [org_id, indent_number, indent.kitchen_id]);
            if (charges.length) {
                await conn.query(
                    `INSERT INTO indent_charge (org_id, indent_number, kitchen_id, line_no, description, amount, taxable) VALUES ?`,
                    [charges.map((c, i) => [org_id, indent_number, indent.kitchen_id, i + 1, c.description, r2(c.amount), c.taxable])]);
            }
            const newStatus = finalize ? 'F' : indent.status;
            await conn.query(
                `UPDATE indent_header SET inv_credit_term = ?, status = ?, updated_by = ?, updated_date = ?
                        ${finalize ? ', inv_finalized_by = ?, inv_finalized_date = ?' : ''}
                  WHERE org_id = ? AND indent_number = ?`,
                [credit_term, newStatus, user.user_id, new Date(), ...(finalize ? [user.user_id, new Date()] : []), org_id, indent_number]);
            await conn.commit();
        } catch (err) {
            try { await conn.rollback(); } catch (e) {}
            throw err;
        } finally {
            await this.releaseWriteConnection(conn);
        }
        const res = await this.getSetup(org_id, indent_number);
        res.message = finalize ? 'Invoice finalized. The kitchen can now dispatch.' : 'Invoice settings saved';
        return res;
    }
}

module.exports = { InvoiceModule, taxFor, PROVINCE };
