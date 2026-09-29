// Invoice payments & receivables. All SQL uses ? placeholders.
const moment = require('moment-timezone');
const BaseDao = require('../dao/base_dao');
const { TERMS, normTerm, dueDateFor } = require('../../common/terms');

const TZ = process.env.INVOICE_TZ || 'America/Toronto';
const MODES = ['INTERAC', 'CASH', 'CHEQUE', 'CARD', 'BANK', 'INTERNAL'];
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fail = (status, message) => ({ status, code: status * 10, message, developerMessage: message });
const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const today = () => moment().tz(TZ).format('YYYY-MM-DD');

// O = open, P = part paid, F = fully paid
const statusFor = (total, paid) => (paid <= 0 ? 'O' : paid + 0.004 >= total ? 'F' : 'P');

const INVOICE_COLS = `i.org_id, i.invoice_number, i.indent_number, i.branch_id, i.kitchen_id,
    DATE_FORMAT(i.invoice_date,'%Y-%m-%d') AS invoice_date, DATE_FORMAT(i.due_date,'%Y-%m-%d') AS due_date,
    i.terms, i.credit_term, i.total_amount, i.amount_paid, i.balance_due, i.status,
    DATE_FORMAT(i.paid_date,'%Y-%m-%d') AS paid_date,
    b.branch_name, COALESCE(b.legal_name, b.branch_name) AS bill_to_name, b.branch_type,
    k.branch_name AS kitchen_name,
    CASE WHEN i.balance_due > 0 AND i.due_date < CURDATE() THEN DATEDIFF(CURDATE(), i.due_date) ELSE 0 END AS days_overdue`;

const numify = (r) => ({
    ...r,
    total_amount: Number(r.total_amount), amount_paid: Number(r.amount_paid), balance_due: Number(r.balance_due),
    days_overdue: Number(r.days_overdue || 0),
});

class PaymentModule extends BaseDao {

    async listInvoices(org_id, { branch_id, status, from_date, to_date }) {
        const conn = await this.getReadConnection();
        try {
            const params = [org_id];
            let where = 'i.org_id = ?';
            if (branch_id) { where += ' AND i.branch_id = ?'; params.push(branch_id); }
            if (status === 'open') where += ' AND i.balance_due > 0';
            else if (status === 'overdue') where += ' AND i.balance_due > 0 AND i.due_date < CURDATE()';
            else if (status === 'paid') where += ' AND i.balance_due <= 0';
            if (from_date) { where += ' AND i.invoice_date >= ?'; params.push(from_date); }
            if (to_date) { where += ' AND i.invoice_date <= ?'; params.push(to_date); }
            const rows = await conn.query(
                `SELECT ${INVOICE_COLS}
                   FROM invoice_header i
                   LEFT JOIN branch_master b ON b.org_id = i.org_id AND b.branch_id = i.branch_id
                   LEFT JOIN branch_master k ON k.org_id = i.org_id AND k.branch_id = i.kitchen_id
                  WHERE ${where}
                  ORDER BY i.due_date, i.invoice_number`, params);
            return ok({ invoices: rows.map(numify) });
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    // Totals for alerts + ageing per customer
    async summary(org_id, branch_id) {
        const conn = await this.getReadConnection();
        try {
            const params = [org_id];
            let where = 'i.org_id = ? AND i.balance_due > 0';
            if (branch_id) { where += ' AND i.branch_id = ?'; params.push(branch_id); }
            const rows = await conn.query(
                `SELECT i.branch_id, COALESCE(b.legal_name, b.branch_name) AS name, b.branch_type,
                        SUM(i.balance_due) AS outstanding,
                        SUM(CASE WHEN i.due_date >= CURDATE() THEN i.balance_due ELSE 0 END) AS current_amt,
                        SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 1 AND 30 THEN i.balance_due ELSE 0 END) AS d1_30,
                        SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END) AS d31_60,
                        SUM(CASE WHEN DATEDIFF(CURDATE(), i.due_date) > 60 THEN i.balance_due ELSE 0 END) AS d60_plus,
                        SUM(CASE WHEN i.due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_count,
                        SUM(CASE WHEN i.due_date < CURDATE() THEN i.balance_due ELSE 0 END) AS overdue_amt,
                        SUM(CASE WHEN i.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS due_soon_count,
                        SUM(CASE WHEN i.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN i.balance_due ELSE 0 END) AS due_soon_amt,
                        COUNT(*) AS open_count,
                        DATE_FORMAT(MIN(CASE WHEN i.due_date >= CURDATE() THEN i.due_date END),'%Y-%m-%d') AS next_due_date
                   FROM invoice_header i
                   LEFT JOIN branch_master b ON b.org_id = i.org_id AND b.branch_id = i.branch_id
                  WHERE ${where}
                  GROUP BY i.branch_id, b.legal_name, b.branch_name, b.branch_type
                  ORDER BY overdue_amt DESC, outstanding DESC`, params);
            const aging = rows.map((r) => {
                const out = {};
                Object.keys(r).forEach((k) => (out[k] = ['branch_id', 'name', 'branch_type', 'next_due_date'].includes(k) ? r[k] : Number(r[k] || 0)));
                return out;
            });
            const sum = (k) => r2(aging.reduce((s, a) => s + a[k], 0));
            // indents received but not yet invoiced
            const nParams = [org_id];
            let nWhere = `h.org_id = ? AND h.status = 'R' AND i.invoice_number IS NULL`;
            if (branch_id) { nWhere += ' AND h.branch_id = ?'; nParams.push(branch_id); }
            const [ni] = await conn.query(
                `SELECT COUNT(*) AS n FROM indent_header h
                   LEFT JOIN invoice_header i ON i.org_id = h.org_id AND i.indent_number = h.indent_number AND i.kitchen_id = h.kitchen_id
                  WHERE ${nWhere}`, nParams);
            const nextDue = aging.map((a) => a.next_due_date).filter(Boolean).sort()[0] || null;
            return ok({
                totals: {
                    outstanding: sum('outstanding'), open_count: sum('open_count'),
                    overdue_count: sum('overdue_count'), overdue_amt: sum('overdue_amt'),
                    due_soon_count: sum('due_soon_count'), due_soon_amt: sum('due_soon_amt'),
                    current_amt: sum('current_amt'), d1_30: sum('d1_30'), d31_60: sum('d31_60'), d60_plus: sum('d60_plus'),
                    not_invoiced_count: Number(ni.n), next_due_date: nextDue,
                },
                aging,
            });
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    async payments(org_id, invoice_number) {
        const conn = await this.getReadConnection();
        try {
            const [inv] = await conn.query(
                `SELECT ${INVOICE_COLS} FROM invoice_header i
                   LEFT JOIN branch_master b ON b.org_id = i.org_id AND b.branch_id = i.branch_id
                   LEFT JOIN branch_master k ON k.org_id = i.org_id AND k.branch_id = i.kitchen_id
                  WHERE i.org_id = ? AND i.invoice_number = ?`, [org_id, invoice_number]);
            if (!inv) return fail(404, 'Invoice not found');
            const payments = await conn.query(
                `SELECT payment_id, receipt_no, DATE_FORMAT(payment_date,'%Y-%m-%d') AS payment_date, amount, mode, reference, note,
                        voided, void_reason, voided_by, created_by, DATE_FORMAT(created_date,'%Y-%m-%d %H:%i') AS created_at
                   FROM invoice_payment WHERE org_id = ? AND invoice_number = ? ORDER BY payment_date, payment_id`,
                [org_id, invoice_number]);
            return ok({ invoice: numify(inv), payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })) });
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    // Recompute amount_paid / balance / status of one invoice from its non-voided payments.
    async _refresh(conn, org_id, invoice_number) {
        const [inv] = await conn.query(
            `SELECT total_amount FROM invoice_header WHERE org_id = ? AND invoice_number = ?`, [org_id, invoice_number]);
        const [p] = await conn.query(
            `SELECT COALESCE(SUM(amount),0) AS paid, DATE_FORMAT(MAX(payment_date),'%Y-%m-%d') AS last_date
               FROM invoice_payment WHERE org_id = ? AND invoice_number = ? AND voided = 'N'`, [org_id, invoice_number]);
        const total = Number(inv.total_amount);
        const paid = r2(Number(p.paid));
        const status = statusFor(total, paid);
        await conn.query(
            `UPDATE invoice_header SET amount_paid = ?, balance_due = ?, status = ?, paid_date = ?
              WHERE org_id = ? AND invoice_number = ?`,
            [paid, r2(Math.max(total - paid, 0)), status, status === 'F' ? p.last_date : null, org_id, invoice_number]);
    }

    async _receiptNo(conn, org_id) {
        await conn.query(`INSERT IGNORE INTO vts_seq_generator (seq_type, branch_id, last_seq_no) VALUES ('RCP', ?, 0)`, [org_id]);
        await conn.query(`UPDATE vts_seq_generator SET last_seq_no = LAST_INSERT_ID(last_seq_no + 1) WHERE seq_type = 'RCP' AND branch_id = ?`, [org_id]);
        const [row] = await conn.query(`SELECT LAST_INSERT_ID() AS n`);
        return 'RCP-' + String(row.n).padStart(6, '0');
    }

    /**
     * body: { invoice_numbers: [..], amount, payment_date, mode, reference, note }
     * The amount is applied to the chosen invoices oldest due date first; all of them must be the same customer.
     */
    async record(admin, body) {
        const org_id = admin.org_id;
        const invoices = Array.isArray(body.invoice_numbers) ? [...new Set(body.invoice_numbers.filter(Boolean))] : [];
        const amount = r2(Number(body.amount));
        const mode = String(body.mode || '').toUpperCase();
        const payment_date = /^\d{4}-\d{2}-\d{2}$/.test(body.payment_date || '') ? body.payment_date : today();
        if (!invoices.length) return fail(400, 'Choose at least one invoice');
        if (!(amount > 0)) return fail(400, 'Enter an amount greater than 0');
        if (!MODES.includes(mode)) return fail(400, 'Choose a payment mode');
        if (payment_date > today()) return fail(400, 'Payment date cannot be in the future');

        const conn = await this.getWriteConnection();
        try {
            await conn.begintransaction();
            const rows = await conn.query(
                `SELECT invoice_number, branch_id, balance_due FROM invoice_header
                  WHERE org_id = ? AND invoice_number IN (?) ORDER BY due_date, invoice_number FOR UPDATE`,
                [org_id, invoices]);
            if (rows.length !== invoices.length) { await conn.rollback(); return fail(404, 'One or more invoices were not found'); }
            if (new Set(rows.map((r) => r.branch_id)).size > 1) { await conn.rollback(); return fail(400, 'All invoices in one payment must be for the same customer'); }
            const open = r2(rows.reduce((s, r) => s + Number(r.balance_due), 0));
            if (amount > open + 0.004) { await conn.rollback(); return fail(400, `Amount is more than the balance due ($${open.toFixed(2)})`); }

            const receipt_no = await this._receiptNo(conn, org_id);
            let left = amount;
            const applied = [];
            for (const r of rows) {
                if (left <= 0) break;
                const part = r2(Math.min(left, Number(r.balance_due)));
                if (part <= 0) continue;
                await conn.query(`INSERT INTO invoice_payment SET ?`, [{
                    org_id, receipt_no, invoice_number: r.invoice_number, branch_id: r.branch_id, payment_date, amount: part, mode,
                    reference: body.reference ? String(body.reference).slice(0, 100) : null,
                    note: body.note ? String(body.note).slice(0, 500) : null,
                    created_by: admin.user_id, created_date: new Date(),
                }]);
                await this._refresh(conn, org_id, r.invoice_number);
                applied.push({ invoice_number: r.invoice_number, amount: part });
                left = r2(left - part);
            }
            await conn.commit();
            return ok({ message: `Payment ${receipt_no} recorded`, receipt_no, applied });
        } catch (err) {
            try { await conn.rollback(); } catch (e) {}
            throw err;
        } finally {
            await this.releaseWriteConnection(conn);
        }
    }

    async voidPayment(admin, { payment_id, reason }) {
        if (!payment_id) return fail(400, 'payment_id is required');
        if (!reason || String(reason).trim().length < 3) return fail(400, 'Enter a reason for voiding');
        const conn = await this.getWriteConnection();
        try {
            await conn.begintransaction();
            const [p] = await conn.query(
                `SELECT payment_id, invoice_number, voided FROM invoice_payment WHERE org_id = ? AND payment_id = ? FOR UPDATE`,
                [admin.org_id, payment_id]);
            if (!p) { await conn.rollback(); return fail(404, 'Payment not found'); }
            if (p.voided === 'Y') { await conn.rollback(); return fail(400, 'This payment is already voided'); }
            await conn.query(
                `UPDATE invoice_payment SET voided = 'Y', void_reason = ?, voided_by = ?, voided_date = ? WHERE payment_id = ?`,
                [String(reason).trim().slice(0, 500), admin.user_id, new Date(), payment_id]);
            await this._refresh(conn, admin.org_id, p.invoice_number);
            await conn.commit();
            return ok({ message: 'Payment voided' });
        } catch (err) {
            try { await conn.rollback(); } catch (e) {}
            throw err;
        } finally {
            await this.releaseWriteConnection(conn);
        }
    }

    // Change the credit term of one invoice (only before any payment)
    async changeTerms(admin, { invoice_number, credit_term }) {
        if (!TERMS[credit_term]) return fail(400, 'Choose a valid credit term');
        const conn = await this.getReadConnection();
        try {
            const [inv] = await conn.query(
                `SELECT DATE_FORMAT(invoice_date,'%Y-%m-%d') AS invoice_date, amount_paid FROM invoice_header
                  WHERE org_id = ? AND invoice_number = ?`, [admin.org_id, invoice_number]);
            if (!inv) return fail(404, 'Invoice not found');
            if (Number(inv.amount_paid) > 0) return fail(400, 'Terms cannot change after a payment is recorded');
            const term = normTerm(credit_term);
            await conn.query(
                `UPDATE invoice_header SET credit_term = ?, terms = ?, due_date = ? WHERE org_id = ? AND invoice_number = ?`,
                [term, TERMS[term].label, dueDateFor(term, inv.invoice_date), admin.org_id, invoice_number]);
            return ok({ message: 'Terms updated' });
        } finally {
            await this.releaseReadConnection(conn);
        }
    }
}

module.exports = { PaymentModule, MODES };
