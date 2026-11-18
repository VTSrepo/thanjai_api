/**
 * Create / update the Tanjo Foods database. Safe to re-run – nothing is dropped or overwritten.
 *
 *   Local (Tanjofoods/api/.env):      npm run setup-db
 *   On the VPS (inside thanjai_api):  sudo node tanjofoods/api/scripts/setup-db.js
 *                                     (reads TANJO_* settings from thanjai_api/.env; with TANJO_DB_ADMIN_SOCKET it logs
 *                                      in like "sudo mysql", so no root password is needed)
 *   Options:  --reseed-products   reload products from database/03_seed_products.sql (overwrites product data)
 *
 * Steps: 1 database · 2 tables (CREATE IF NOT EXISTS) + column migrations · 3 reference data · 4 products (only if empty)
 *        5 data migrations in database/migrations (each once) · 6 price history · 7 first admin login · 8 app login
 */
const fs = require("fs");
const path = require("path");

// Settings file: Tanjofoods/api/.env (standalone) or the host app's .env (thanjai_api/.env) when embedded
const own = path.join(__dirname, "..", ".env"), host = path.join(__dirname, "..", "..", "..", ".env");
if (fs.existsSync(own)) process.env.TANJO_STANDALONE = "1";
require("dotenv").config({ path: fs.existsSync(own) ? own : host, quiet: true });

const mysql = require("mysql2/promise");
const cfg = require("../config");
const { hashPassword } = require("../lib/passwords");

const DB = cfg.db.name;
const SQL_DIR = path.join(__dirname, "..", "..", "database");
const reseed = process.argv.includes("--reseed-products");
const ok = m => console.log("  ✓ " + m);
const info = m => console.log("  • " + m);
const sqlFile = p => fs.readFileSync(p, "utf8").replace(/\bTanjofoods\b/g, DB);   // allow a custom DB name

(async () => {
  console.log(`\nTanjo Foods – database setup  (database "${DB}", settings from ${fs.existsSync(own) ? own : host})\n`);
  const sock = cfg.env("DB_ADMIN_SOCKET", "");
  let admin;
  try {
    admin = await mysql.createConnection({
      ...(sock ? { socketPath: sock } : { host: cfg.db.host, port: cfg.db.port }),
      user: cfg.env("DB_ADMIN_USER", "root"), password: cfg.env("DB_ADMIN_PASSWORD", ""),
      multipleStatements: true, charset: "utf8mb4",
    });
  } catch (e) {
    console.error(`  ✗ Could not log in to MySQL as ${cfg.env("DB_ADMIN_USER", "root")}${sock ? " via socket " + sock + " (run with sudo)" : ""}: ${e.message}`);
    process.exit(1);
  }

  // 1. database
  const [[{ n: dbExists }]] = await admin.query("SELECT COUNT(*) n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [DB]);
  const [[{ n: tablesBefore }]] = await admin.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE='BASE TABLE'", [DB]);
  info(dbExists ? `Database ${DB} already exists (${tablesBefore} tables) – keeping existing data` : `Creating database ${DB}`);

  // 2. schema
  await admin.query(sqlFile(path.join(SQL_DIR, "01_schema.sql")));
  await admin.changeUser({ database: DB });
  const [[{ n: tablesAfter }]] = await admin.query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE='BASE TABLE'", [DB]);
  ok(`Schema ready – ${tablesAfter} tables (${tablesAfter - tablesBefore} new) + view v_storefront_products`);
  const cols = [
    ["orders", "access_token", "ALTER TABLE orders ADD COLUMN access_token CHAR(32) NULL AFTER order_no"],
    ["enquiries", "updated_by", "ALTER TABLE enquiries ADD COLUMN updated_by INT UNSIGNED NULL AFTER assigned_to"],
    ["orders", "lang", "ALTER TABLE orders ADD COLUMN lang CHAR(2) NOT NULL DEFAULT 'en' AFTER channel"],
  ];
  for (const [t, c, ddl] of cols) {
    const [[{ n }]] = await admin.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?", [DB, t, c]);
    if (!n) { await admin.query(ddl); ok(`Added column ${t}.${c}`); }
  }

  // 3. reference data
  await admin.query(sqlFile(path.join(SQL_DIR, "02_seed_reference.sql")));
  ok("Reference data: categories, GST/QST, delivery zone & slots, settings");

  // 4. products
  const [[{ n: prodCount }]] = await admin.query("SELECT COUNT(*) n FROM products");
  if (!prodCount || reseed) {
    await admin.query(sqlFile(path.join(SQL_DIR, "03_seed_products.sql")));
    const [[{ n }]] = await admin.query("SELECT COUNT(*) n FROM products");
    ok(`Products loaded from 03_seed_products.sql – ${n} products`);
  } else info(`Products table already has ${prodCount} products – left unchanged (use --reseed-products to reload)`);

  // 5. data migrations, each applied once
  await admin.query("CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(120) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
  const migDir = path.join(SQL_DIR, "migrations");
  const files = fs.existsSync(migDir) ? fs.readdirSync(migDir).filter(f => f.endsWith(".sql")).sort() : [];
  for (const f of files) {
    const [[done]] = await admin.query("SELECT name FROM schema_migrations WHERE name = ?", [f]);
    if (done) continue;
    await admin.query(sqlFile(path.join(migDir, f)));
    await admin.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
    ok(`Migration ${f}`);
  }
  // photo paths are relative since 2026-11 (works at / and /v1/tanjo/)
  const [fix] = await admin.query("UPDATE product_images SET file_name = SUBSTRING(file_name, 2) WHERE file_name LIKE '/product-images/%'");
  if (fix.affectedRows) ok(`Photo paths updated (${fix.affectedRows})`);

  // 6. price history: opening row for every priced product
  const [ph] = await admin.query(
    `INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note)
     SELECT p.product_id, p.price, p.compare_at_price, p.created_at, 1, 'INITIAL', 'Opening price'
       FROM products p WHERE p.price > 0 AND NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id = p.product_id)`);
  if (ph.affectedRows) ok(`Price history started for ${ph.affectedRows} product(s)`);
  const [[{ n: drafts }]] = await admin.query("SELECT COUNT(*) n FROM products WHERE price <= 0");
  if (drafts) info(`${drafts} product(s) have no price yet – they stay hidden from the shop until a price is set and they are made Active`);

  // 7. first admin login
  const [[{ n: admins }]] = await admin.query("SELECT COUNT(*) n FROM admin_users");
  if (!admins) {
    const email = cfg.env("ADMIN_EMAIL", "admin@tanjofoods.com").toLowerCase();
    const pw = cfg.env("ADMIN_PASSWORD", "Tanjo@2026");
    await admin.query("INSERT INTO admin_users (full_name, email, password_hash, role) VALUES (?,?,?, 'OWNER')",
      [cfg.env("ADMIN_NAME", "Administrator"), email, hashPassword(pw)]);
    ok(`Created first admin login:  ${email}  /  ${cfg.env("ADMIN_PASSWORD", "") ? "(password from ADMIN_PASSWORD setting)" : pw + "   <- change it after signing in"}`);
  } else info(`${admins} admin user(s) already exist – logins unchanged`);

  // 8. dedicated app login – rights on this database only
  const appUser = cfg.db.user, appPwd = cfg.db.password;
  if (!appUser || appUser === cfg.env("DB_ADMIN_USER", "root")) info("DB_USER is the admin user – skipping dedicated app user (not recommended)");
  else {
    for (const h of ["localhost", "127.0.0.1"]) {
      const [[{ n }]] = await admin.query("SELECT COUNT(*) n FROM mysql.user WHERE User=? AND Host=?", [appUser, h]);
      if (!n) {
        try { await admin.query("CREATE USER ?@? IDENTIFIED BY ?", [appUser, h, appPwd]); }
        catch (e) {
          if (e.code === "ER_NOT_VALID_PASSWORD") {
            console.error(`  \u2717 MySQL's password policy rejected the DB password for '${appUser}'.`);
            console.error("    Use upper + lower case letters, digits and a symbol, e.g. generate one with:");
            console.error(`      P="Tj-$(openssl rand -hex 10)-Q7@x"; echo $P`);
            console.error("    put it in the DB password setting (TANJO_DB_PASSWORD / DB_PASSWORD) and run setup-db again.");
            process.exit(1);
          }
          throw e;
        }
      }
      await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB}\`.* TO ?@?`, [appUser, h]);
      if (!n) ok(`Created MySQL user '${appUser}'@'${h}' with access to ${DB} only`);
    }
    info(`App user '${appUser}' can read/write ${DB} only – no access to other databases`);
  }
  await admin.end();

  try {
    const app = await mysql.createConnection({ host: cfg.db.host, port: cfg.db.port, user: appUser, password: appPwd, database: DB });
    const [[{ n }]] = await app.query("SELECT COUNT(*) n FROM v_storefront_products");
    await app.end();
    ok(`App login OK – shop shows ${n} products`);
    console.log("\nDone.\n");
  } catch (e) {
    console.error(`  ✗ App user '${appUser}' could not log in: ${e.message}`);
    console.error("    If this user already existed with a different password, update the DB password setting");
    process.exit(1);
  }
})().catch(e => { console.error("\n  ✗ Setup failed:", e.message); process.exit(1); });
