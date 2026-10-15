// Sets a new password for a staff user (e.g. a forgotten admin password) directly in the database.
// Usage: node scripts/reset-password.js <user id> <new password>     (DB settings from the same env vars as the API)
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");

(async () => {
  const [userId, pwd] = process.argv.slice(2);
  if (!userId || !pwd) throw new Error("Usage: node scripts/reset-password.js <user id> <new password>");
  if (pwd.length < 6) throw new Error("The new password must be at least 6 characters");
  const conn = await mysql.createConnection({
    host: process.env.WRITE_DB_SRV_HOST, port: process.env.WRITE_DB_PORT || 3306,
    user: process.env.WRITE_DB_USER, password: process.env.WRITE_DB_PASSWORD, database: process.env.WRITE_DB_DATABASE,
  });
  const [rows] = await conn.query("SELECT user_id, user_name, user_type, user_status FROM user_master WHERE user_id = ?", [userId]);
  if (!rows.length) {
    const [admins] = await conn.query("SELECT user_id, user_name FROM user_master WHERE user_type = 'A' ORDER BY user_id");
    console.log(`  No user "${userId}" in ${process.env.WRITE_DB_DATABASE}.`);
    console.log(`  Admin users in this database: ${admins.map((a) => `${a.user_id} (${a.user_name || ""})`).join(", ") || "none"}`);
    await conn.end();
    process.exit(1);
  }
  await conn.query(
    "UPDATE user_master SET pwd = ?, pwd_reset_required = 'N', user_status = 'A', updated_by = 'password-reset', updated_date = NOW() WHERE user_id = ?",
    [await bcrypt.hash(pwd, 10), userId]);
  console.log(`  Password changed for ${userId} (${rows[0].user_name || ""}) in ${process.env.WRITE_DB_DATABASE}. You can log in now.`);
  await conn.end();
})().catch((e) => { console.error("  ERROR:", e.message); process.exit(1); });
