const { BranchDao, EDITABLE_COLUMNS } = require('../dao/branch_dao');

const PROVINCES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const GST_RE = /^\d{9}RT\d{4}$/i;   // CRA business number + RT program account
const QST_RE = /^\d{10}TQ\d{4}$/i;  // Revenu Quebec QST number

function fail(message) {
    return { status: 400, code: 4000, message, developerMessage: message };
}

function clean(input) {
    const out = {};
    for (const col of EDITABLE_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(input, col)) continue;
        let v = input[col];
        if (typeof v === 'string') v = v.trim();
        out[col] = v === '' || v === undefined ? null : v;
    }
    ['gst_hst_reg_no', 'qst_reg_no', 'province_code', 'postal_code'].forEach((c) => {
        if (out[c]) out[c] = String(out[c]).toUpperCase().replace(/\s+/g, c === 'postal_code' ? ' ' : '');
    });
    ['gst_hst_rate', 'qst_rate'].forEach((c) => {
        if (out[c] !== undefined && out[c] !== null) out[c] = Number(out[c]);
    });
    return out;
}

function validate(b, isNew) {
    if (isNew && !b.branch_name) return fail('Branch name is required');
    if (b.branch_name === null) return fail('Branch name is required');
    if (b.branch_type && !['B', 'K'].includes(b.branch_type)) return fail('Branch type must be B (Branch) or K (Kitchen)');
    if (b.ownership_type && !['O', 'F'].includes(b.ownership_type)) return fail('Ownership must be O (Own) or F (Franchise)');
    if (b.branch_status && !['A', 'I'].includes(b.branch_status)) return fail('Status must be A (Active) or I (Inactive)');
    if (b.province_code && !PROVINCES.includes(b.province_code)) return fail('Invalid province code');
    if (b.gst_hst_reg_no && !GST_RE.test(b.gst_hst_reg_no)) return fail('GST/HST number format: 123456789RT0001');
    if (b.qst_reg_no && !QST_RE.test(b.qst_reg_no)) return fail('QST number format: 1234567890TQ0001');
    for (const c of ['gst_hst_rate', 'qst_rate']) {
        if (b[c] !== undefined && b[c] !== null && (isNaN(b[c]) || b[c] < 0 || b[c] > 20)) return fail(`${c} must be between 0 and 20`);
    }
    return null;
}

class BranchModule {

    async getBranch(org_id, branch_id) {
        const dao = new BranchDao();
        const conn = await dao.getReadConnection();
        try {
            const branch = await dao.getBranch(conn, org_id, branch_id);
            if (!branch) return { status: 404, code: 4001, message: 'Branch not found', developerMessage: 'Branch not found' };
            return { status: 200, code: 200, message: 'Success', developerMessage: 'Success', branch };
        } finally {
            await dao.releaseReadConnection(conn);
        }
    }

    // Creates when branch_id is empty, otherwise updates.
    async saveBranch(input, user_id) {
        if (!input || !input.org_id) return fail('org_id is required');
        const org_id = String(input.org_id).trim();
        const isNew = !input.branch_id;
        const data = clean(input);
        const err = validate(data, isNew);
        if (err) return err;

        const dao = new BranchDao();
        const conn = await dao.getReadConnection();
        try {
            const now = new Date();
            let branch_id = input.branch_id;
            if (isNew) {
                branch_id = await dao.nextBranchId(conn, org_id);
                const row = {
                    branch_status: 'A', branch_type: 'B', ownership_type: 'O',
                    ...data, org_id, branch_id, created_by: user_id || null, created_date: now,
                };
                await dao.createBranch(conn, row);
            } else {
                const existing = await dao.getBranch(conn, org_id, branch_id);
                if (!existing) return { status: 404, code: 4001, message: 'Branch not found', developerMessage: 'Branch not found' };
                await dao.updateBranch(conn, org_id, branch_id, { ...data, updated_by: user_id || null, updated_date: now });
            }
            const branch = await dao.getBranch(conn, org_id, branch_id);
            return { status: 200, code: 200, message: isNew ? 'Branch created' : 'Branch updated', developerMessage: 'Success', branch };
        } finally {
            await dao.releaseReadConnection(conn);
        }
    }
}

module.exports = { BranchModule };
