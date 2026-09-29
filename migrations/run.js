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
  {
    id: "002_invoicing",
    table: "branch_master",
    columns: [
      ["invoice_notes", "VARCHAR(500) NULL AFTER qst_rate"], // printed under "Notes" on invoices this branch issues
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS invoice_header (
        org_id VARCHAR(5) NOT NULL,
        invoice_number VARCHAR(20) NOT NULL,
        indent_number VARCHAR(15) NOT NULL,
        branch_id VARCHAR(12) NOT NULL,
        kitchen_id VARCHAR(15) NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NULL,
        terms VARCHAR(50) NULL,
        sub_total DECIMAL(12,2) NOT NULL DEFAULT 0,
        gst_label VARCHAR(10) NULL,
        gst_rate DECIMAL(6,3) NULL,
        gst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        qst_rate DECIMAL(6,3) NULL,
        qst_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
        seller_info TEXT NULL,
        bill_to_info TEXT NULL,
        notes VARCHAR(500) NULL,
        status VARCHAR(1) NOT NULL DEFAULT 'O',
        created_by VARCHAR(50) NULL,
        created_date DATETIME NULL,
        PRIMARY KEY (org_id, invoice_number),
        UNIQUE KEY uq_invoice_indent (org_id, indent_number, kitchen_id),
        KEY ix_invoice_branch_date (org_id, branch_id, invoice_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS invoice_detail (
        org_id VARCHAR(5) NOT NULL,
        invoice_number VARCHAR(20) NOT NULL,
        line_no INT NOT NULL,
        item_code VARCHAR(15) NOT NULL,
        item_name VARCHAR(500) NULL,
        uom VARCHAR(100) NULL,
        qty DECIMAL(12,3) NOT NULL DEFAULT 0,
        rate DECIMAL(12,4) NOT NULL DEFAULT 0,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        PRIMARY KEY (org_id, invoice_number, line_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
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
    for (const stmt of m.sql || []) await conn.query(stmt); // CREATE TABLE IF NOT EXISTS - idempotent
    console.log(`${m.id}: ${missing.length ? "added " + missing.map((c) => c[0]).join(", ") : "columns already present"}${m.sql ? ", tables checked" : ""}`);
  }
  await conn.end();
})().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
