// Login, change password, admin password reset. All SQL uses ? placeholders.
const BaseDao = require('../dao/base_dao');
const { signToken, hashPassword, verifyPassword, isHash } = require('../../common/auth');

const fail = (status, message) => ({ status, code: status * 10, message, developerMessage: message });
const MIN_LEN = 6;

class AuthModule extends BaseDao {

    async _findUser(conn, user_id) {
        const rows = await conn.query(
            `SELECT user_id, org_id, branch_id, user_name, user_type, user_status, pwd, pwd_reset_required
               FROM user_master WHERE user_id = ? ORDER BY (user_status = 'A') DESC LIMIT 1`, [user_id]);
        return rows[0] || null;
    }

    async login(user_id, pwd) {
        if (!user_id || !pwd) return fail(401, 'Invalid Credentials');
        const conn = await this.getReadConnection();
        try {
            const u = await this._findUser(conn, String(user_id).trim());
            if (!u || !(await verifyPassword(pwd, u.pwd))) return fail(401, 'Invalid Credentials');
            if (u.user_status && u.user_status !== 'A') return fail(401, 'This user is inactive. Please contact your admin.');
            if (!isHash(u.pwd)) {
                // Upgrade legacy plain-text password to a hash on first successful login
                await conn.query(`UPDATE user_master SET pwd = ? WHERE user_id = ? AND org_id = ? AND branch_id = ?`,
                    [await hashPassword(pwd), u.user_id, u.org_id, u.branch_id]);
            }
            const user = {
                user_id: u.user_id, user_name: u.user_name, user_status: u.user_status,
                org_id: u.org_id, branch_id: u.branch_id, user_type: u.user_type,
                must_change_pwd: u.pwd_reset_required === 'Y',
            };
            return { status: 200, code: 200, message: 'Success', developerMessage: 'Success', user, token: signToken(u) };
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    async changePassword(authUser, current_pwd, new_pwd) {
        if (!new_pwd || String(new_pwd).length < MIN_LEN) return fail(400, `New password must be at least ${MIN_LEN} characters`);
        if (current_pwd === new_pwd) return fail(400, 'New password must be different from the current one');
        const conn = await this.getReadConnection();
        try {
            const u = await this._findUser(conn, authUser.user_id);
            if (!u || !(await verifyPassword(current_pwd, u.pwd))) return fail(400, 'Current password is not correct');
            await conn.query(
                `UPDATE user_master SET pwd = ?, pwd_reset_required = 'N', updated_by = ?, updated_date = ?
                  WHERE user_id = ? AND org_id = ? AND branch_id = ?`,
                [await hashPassword(new_pwd), u.user_id, new Date(), u.user_id, u.org_id, u.branch_id]);
            return { status: 200, code: 200, message: 'Password changed', developerMessage: 'Success' };
        } finally {
            await this.releaseReadConnection(conn);
        }
    }

    // Admin sets a temporary password; the user must change it at next login.
    async resetPassword(admin, user_id, temp_pwd) {
        if (!user_id) return fail(400, 'user_id is required');
        if (!temp_pwd || String(temp_pwd).length < MIN_LEN) return fail(400, `Temporary password must be at least ${MIN_LEN} characters`);
        const conn = await this.getReadConnection();
        try {
            const r = await conn.query(
                `UPDATE user_master SET pwd = ?, pwd_reset_required = 'Y', updated_by = ?, updated_date = ?
                  WHERE user_id = ? AND org_id = ?`,
                [await hashPassword(temp_pwd), admin.user_id, new Date(), user_id, admin.org_id]);
            if (!r.affectedRows) return fail(404, 'User not found');
            return { status: 200, code: 200, message: 'Password reset. The user must change it at next login.', developerMessage: 'Success' };
        } finally {
            await this.releaseReadConnection(conn);
        }
    }
}

module.exports = { AuthModule, hashPassword };
