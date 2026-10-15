// Creates the preview database (WRITE_DB_DATABASE) as a copy of SOURCE_DB on the same MySQL server.
// Runs only when the preview database has no tables yet. No mysql command-line tool needed.
const mysql = require("mysql2/promise");

(async () => {
  const target = process.env.WRITE_DB_DATABASE;
  const source = process.env.SOURCE_DB || "thanjai_restaurant";
  if (!target || target === source) throw new Error("WRITE_DB_DATABASE must be set and differ from SOURCE_DB");
  const conn = await mysql.createConnection({
    host: process.env.WRITE_DB_SRV_HOST, port: process.env.WRITE_DB_PORT || 3306,
    user: process.env.WRITE_DB_USER, password: process.env.WRITE_DB_PASSWORD,
  });
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?", [target]);
  if (n > 0) { console.log(`  ${target} already exists (${n} tables) - keeping its data.`); await conn.end(); return; }
  console.log(`  First run: copying ${source} into ${target} ...`);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${target}\``);
  const [tables] = await conn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'", [source]);
  for (const { t } of tables) {
    await conn.query(`CREATE TABLE \`${target}\`.\`${t}\` LIKE \`${source}\`.\`${t}\``);
    await conn.query(`INSERT INTO \`${target}\`.\`${t}\` SELECT * FROM \`${source}\`.\`${t}\``);
  }
  console.log(`  Copied ${tables.length} tables.`);
  await conn.end();
})().catch((e) => { console.error("  ERROR:", e.message); process.exit(1); });
