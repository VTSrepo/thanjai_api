const BaseDao = require('./base_dao');

// Columns an admin may set from the Branch Master screen.
const EDITABLE_COLUMNS = [
    'branch_name', 'branch_type', 'branch_status', 'branch_opendate',
    'branch_address', 'branch_city', 'province_code', 'postal_code',
    'branch_contact_num', 'branch_email_id',
    'branch_cont_pers', 'branch_cont_pers_phone', 'branch_Cont_pers_email',
    'ownership_type', 'legal_name',
    'gst_hst_reg_no', 'qst_reg_no', 'gst_hst_rate', 'qst_rate', 'invoice_notes', 'credit_term',
];

// All queries here use ? placeholders (no string-built SQL).
class BranchDao extends BaseDao {

    async getBranch(connection, org_id, branch_id) {
        const rows = await connection.query(
            `SELECT *, DATE_FORMAT(branch_opendate,'%Y-%m-%d') AS branch_opendate
               FROM branch_master WHERE org_id = ? AND branch_id = ?`,
            [org_id, branch_id]);
        return rows.length ? rows[0] : null;
    }

    async nextBranchId(connection, org_id) {
        // Branch ids follow <org_id><3 digits>, e.g. TR001, TR002 ...
        const rows = await connection.query(
            `SELECT MAX(CAST(SUBSTRING(branch_id, ?) AS UNSIGNED)) AS max_no
               FROM branch_master WHERE org_id = ? AND branch_id REGEXP ?`,
            [org_id.length + 1, org_id, `^${org_id}[0-9]+$`]);
        const next = (rows[0].max_no || 0) + 1;
        return org_id + String(next).padStart(3, '0');
    }

    async createBranch(connection, data) {
        await connection.query(`INSERT INTO branch_master SET ?`, [data]);
        return data;
    }

    async updateBranch(connection, org_id, branch_id, data) {
        await connection.query(
            `UPDATE branch_master SET ? WHERE org_id = ? AND branch_id = ?`,
            [data, org_id, branch_id]);
        return data;
    }
}

module.exports = { BranchDao, EDITABLE_COLUMNS };
