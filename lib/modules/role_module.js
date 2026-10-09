// Role Master + screen permissions.
const BaseDao = require('../dao/base_dao');
const { SCREENS, SCREEN_CODES, USER_TYPES, DEFAULT_ROLE_FOR_TYPE } = require('../../common/screens');

const ok = (extra) => ({ status: 200, code: 200, message: 'Success', developerMessage: 'Success', ...extra });
const fail = (status, message) => ({ status, code: status * 10, message, developerMessage: message });

// Small cache so every request does not hit the DB; role edits apply within CACHE_MS.
const CACHE_MS = 30 * 1000;
const cache = new Map(); // key -> { at, value }
const cached = async (key, load) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
};
const clearCache = () => cache.clear();

class RoleModule extends BaseDao {
  // { SCREEN_CODE: 'V' | 'E' } for a logged-in user. Admin type: everything.
  async permissionsFor(user) {
    if (!user) return {};
    if (user.user_type === 'A') return Object.fromEntries(SCREENS.map((s) => [s.code, 'E']));
    return cached(`u:${user.org_id}:${user.user_id}`, async () => {
      const conn = await this.getReadConnection();
      try {
        const [u] = await conn.query(
          `SELECT role_id, user_type FROM user_master WHERE org_id = ? AND user_id = ? LIMIT 1`, [user.org_id, user.user_id]);
        const roleId = (u && u.role_id) || DEFAULT_ROLE_FOR_TYPE[user.user_type];
        const rows = await conn.query(
          `SELECT s.screen_code, s.can_edit FROM role_screen s
             JOIN role_master r ON r.org_id = s.org_id AND r.role_id = s.role_id AND r.status = 'A'
            WHERE s.org_id = ? AND s.role_id = ?`, [user.org_id, roleId]);
        return Object.fromEntries(rows.map((r) => [r.screen_code, r.can_edit === 'Y' ? 'E' : 'V']));
      } finally {
        await this.releaseReadConnection(conn);
      }
    });
  }

  async list(org_id) {
    const conn = await this.getReadConnection();
    try {
      const roles = await conn.query(
        `SELECT r.role_id, r.role_name, r.description, r.scope, r.is_system, r.status,
                (SELECT COUNT(*) FROM user_master u WHERE u.org_id = r.org_id AND u.role_id = r.role_id) AS user_count
           FROM role_master r WHERE r.org_id = ? ORDER BY FIELD(r.scope,'A','O','K','B','X'), r.role_name`, [org_id]);
      const screens = await conn.query(`SELECT role_id, screen_code, can_edit FROM role_screen WHERE org_id = ?`, [org_id]);
      for (const r of roles) {
        r.screens = Object.fromEntries(
          screens.filter((s) => s.role_id === r.role_id).map((s) => [s.screen_code, s.can_edit === 'Y' ? 'E' : 'V']));
        r.scope_label = USER_TYPES[r.scope] || r.scope;
      }
      return ok({ roles, screens: SCREENS, user_types: USER_TYPES });
    } finally {
      await this.releaseReadConnection(conn);
    }
  }

  async save(admin, body) {
    const org_id = admin.org_id;
    const role_name = String((body && body.role_name) || '').trim();
    const scope = body && body.scope;
    if (!role_name || role_name.length > 100) return fail(400, 'Enter a role name (up to 100 characters)');
    if (!USER_TYPES[scope]) return fail(400, 'Choose which type of user this role is for');
    const screens = (body && body.screens) || {};
    for (const [code, lvl] of Object.entries(screens)) {
      if (!SCREEN_CODES.has(code) || !['V', 'E'].includes(lvl)) return fail(400, `Unknown screen or level: ${code}`);
    }
    let role_id = body.role_id ? String(body.role_id).toUpperCase() : null;

    const conn = await this.getWriteConnection();
    try {
      await conn.begintransaction();
      if (role_id) {
        const [existing] = await conn.query(`SELECT * FROM role_master WHERE org_id = ? AND role_id = ? FOR UPDATE`, [org_id, role_id]);
        if (!existing) { await conn.rollback(); return fail(404, 'Role not found'); }
        if (existing.role_id === 'ADMIN') { await conn.rollback(); return fail(400, 'The Admin role always has full access and cannot be changed'); }
        if (existing.scope !== scope) {
          const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM user_master WHERE org_id = ? AND role_id = ?`, [org_id, role_id]);
          if (n > 0) { await conn.rollback(); return fail(400, 'Users have this role, so its user type cannot change'); }
        }
        await conn.query(
          `UPDATE role_master SET role_name = ?, description = ?, scope = ?, status = ?, updated_by = ?, updated_date = NOW()
            WHERE org_id = ? AND role_id = ?`,
          [role_name, body.description || null, scope, body.status === 'I' ? 'I' : 'A', admin.user_id, org_id, role_id]);
      } else {
        role_id = role_name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 16) || 'ROLE';
        const [dup] = await conn.query(`SELECT 1 FROM role_master WHERE org_id = ? AND role_id LIKE ?`, [org_id, `${role_id}%`]);
        if (dup) role_id = `${role_id.slice(0, 13)}_${Date.now().toString(36).slice(-3).toUpperCase()}`;
        await conn.query(
          `INSERT INTO role_master (org_id, role_id, role_name, description, scope, is_system, status, created_by, created_date)
           VALUES (?, ?, ?, ?, ?, 'N', 'A', ?, NOW())`, [org_id, role_id, role_name, body.description || null, scope, admin.user_id]);
      }
      await conn.query(`DELETE FROM role_screen WHERE org_id = ? AND role_id = ?`, [org_id, role_id]);
      const rows = Object.entries(screens).map(([code, lvl]) => [org_id, role_id, code, lvl === 'E' ? 'Y' : 'N']);
      if (rows.length) await conn.query(`INSERT INTO role_screen (org_id, role_id, screen_code, can_edit) VALUES ?`, [rows]);
      await conn.commit();
    } catch (err) {
      try { await conn.rollback(); } catch (e) {}
      throw err;
    } finally {
      await this.releaseWriteConnection(conn);
    }
    clearCache();
    const res = await this.list(org_id);
    res.message = 'Role saved';
    res.role_id = role_id;
    return res;
  }

  async remove(admin, role_id) {
    const conn = await this.getReadConnection();
    try {
      const [r] = await conn.query(`SELECT is_system FROM role_master WHERE org_id = ? AND role_id = ?`, [admin.org_id, role_id]);
      if (!r) return fail(404, 'Role not found');
      if (r.is_system === 'Y') return fail(400, 'Built-in roles cannot be deleted (you can change their screens)');
      const [{ n }] = await conn.query(`SELECT COUNT(*) AS n FROM user_master WHERE org_id = ? AND role_id = ?`, [admin.org_id, role_id]);
      if (n > 0) return fail(400, `${n} user(s) have this role. Move them to another role first.`);
      await conn.query(`DELETE FROM role_screen WHERE org_id = ? AND role_id = ?`, [admin.org_id, role_id]);
      await conn.query(`DELETE FROM role_master WHERE org_id = ? AND role_id = ?`, [admin.org_id, role_id]);
    } finally {
      await this.releaseReadConnection(conn);
    }
    clearCache();
    return ok({ message: 'Role deleted' });
  }
}

const roleModule = new RoleModule();
module.exports = { RoleModule, roleModule, clearCache };
