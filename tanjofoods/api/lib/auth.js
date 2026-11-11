// Admin sessions + activity (audit) log
const crypto = require("crypto");
const { pool } = require("../db");

const SESSION_HOURS = 12;
const sha = t => crypto.createHash("sha256").update(String(t)).digest("hex");

async function createSession(adminId, req) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO admin_sessions (session_hash, admin_id, ip_address, user_agent, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))",
    [sha(token), adminId, req.ip, String(req.get("user-agent") || "").slice(0, 255), SESSION_HOURS]);
  await pool.query("DELETE FROM admin_sessions WHERE expires_at < NOW()");
  return token;
}

async function endSession(token) { await pool.query("DELETE FROM admin_sessions WHERE session_hash = ?", [sha(token)]); }

function tokenFrom(req) {
  const h = String(req.get("authorization") || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

/** Express middleware: requires a valid admin session; sets req.admin = {admin_id, full_name, email} */
async function requireAdmin(req, res, next) {
  try {
    const token = tokenFrom(req);
    if (!token) return res.status(401).json({ error: "Please sign in" });
    const [[row]] = await pool.query(
      `SELECT a.admin_id, a.full_name, a.email FROM admin_sessions s JOIN admin_users a ON a.admin_id = s.admin_id
        WHERE s.session_hash = ? AND s.expires_at > NOW() AND a.is_active = 1`, [sha(token)]);
    if (!row) return res.status(401).json({ error: "Session expired – please sign in again" });
    // sliding expiry
    pool.query("UPDATE admin_sessions SET last_seen_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE session_hash = ?",
      [SESSION_HOURS, sha(token)]).catch(() => {});
    req.admin = row; req.sessionToken = token;
    next();
  } catch (e) { next(e); }
}

/** Write one activity-log row. conn may be a transaction connection or the pool. */
async function audit(conn, adminId, entity, entityId, action, oldValues, newValues) {
  await (conn || pool).query(
    "INSERT INTO audit_log (admin_id, entity, entity_id, action, old_values, new_values) VALUES (?,?,?,?,?,?)",
    [adminId || null, entity, String(entityId), action,
     oldValues == null ? null : JSON.stringify(oldValues), newValues == null ? null : JSON.stringify(newValues)]);
}

// simple in-memory login throttle: 8 failures per email+IP per 15 minutes
const fails = new Map();
function throttled(key) {
  const f = fails.get(key);
  if (!f) return false;
  if (Date.now() - f.first > 15 * 60_000) { fails.delete(key); return false; }
  return f.n >= 8;
}
function recordFail(key) { const f = fails.get(key) || { n: 0, first: Date.now() }; f.n++; fails.set(key, f); }
function clearFails(key) { fails.delete(key); }

module.exports = { createSession, endSession, requireAdmin, audit, throttled, recordFail, clearFails };
