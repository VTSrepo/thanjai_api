// MySQL connection pool (app user – Tanjofoods database only)
const mysql = require("mysql2/promise");
const { db } = require("./config");

const pool = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.name,
  connectionLimit: 10,
  dateStrings: true,          // DATE / DATETIME come back as plain strings
  decimalNumbers: true,       // DECIMAL comes back as JS number
  charset: "utf8mb4",
});

/** Run fn(conn) inside a transaction; commits or rolls back. */
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, tx };
