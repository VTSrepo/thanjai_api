// Idempotent DB migrations. Usage (same env vars as the API):  node migrations/run.js
const mysql = require("mysql2/promise");

const MIGRATIONS = [
  {
    id: "001_branch_tax_fields",
    table: "branch_master",
    columns: [
      ["branch_city", "VARCHAR(100) NULL AFTER branch_address"],
      ["province_code", "VARCHAR(2) NULL AFTER branch_city"],
      ["postal_code", "VARCHAR(10) NULL AFTER province_code"],
      ["ownership_type", "VARCHAR(1) NULL DEFAULT 'O' AFTER branch_type"],
      ["legal_name", "VARCHAR(200) NULL AFTER ownership_type"],
      ["gst_hst_reg_no", "VARCHAR(20) NULL AFTER legal_name"],
      ["qst_reg_no", "VARCHAR(20) NULL AFTER gst_hst_reg_no"],
      ["gst_hst_rate", "DECIMAL(6,3) NULL AFTER qst_reg_no"],
      ["qst_rate", "DECIMAL(6,3) NULL AFTER gst_hst_rate"],
    ],
  },
];

(async () => {
  const database = process.env.WRITE_DB_DATABASE;
  if (!database) throw new Error("WRITE_DB_DATABASE is not set");
  const conn = await mysql.createConnection({
    host: process.env.WRITE_DB_SRV_HOST,
    port: process.env.WRITE_DB_PORT || 3306,
    user: process.env.WRITE_DB_USER,
    password: process.env.WRITE_DB_PASSWORD,
    database,
  });
  for (const m of MIGRATIONS) {
    const [rows] = await conn.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [database, m.table]
    );
    const existing = new Set(rows.map((r) => r.COLUMN_NAME.toLowerCase()));
    const missing = m.columns.filter(([c]) => !existing.has(c));
    // Add one at a time so AFTER references resolve in order
    for (const [col, def] of missing) {
      await conn.query(`ALTER TABLE \`${m.table}\` ADD COLUMN \`${col}\` ${def}`);
    }
    console.log(`${m.id}: ${missing.length ? "added " + missing.map((c) => c[0]).join(", ") : "already applied"}`);
  }
  await conn.end();
})().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
