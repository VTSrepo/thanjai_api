/**
 * Tanjo Foods – stand-alone server (local testing)
 *   npm run setup-db   (first time – creates the Tanjofoods database)
 *   npm start          -> http://localhost:4100
 * BASE_PATH (optional) serves it under a sub-path, e.g. BASE_PATH=/v1/tanjo -> http://localhost:4100/v1/tanjo/
 */
process.env.TANJO_STANDALONE = "1";
require("dotenv").config({ path: require("path").join(__dirname, ".env"), quiet: true });
const express = require("express");
const cfg = require("./config");
const site = require("./app");
const { pool } = require("./db");

const PORT = Number(cfg.env("PORT", 4100));
const BASE = (cfg.env("BASE_PATH", "") || "").replace(/\/+$/, "");
const host = express();
host.disable("x-powered-by");
if (BASE) { host.use(BASE, site); host.get("/", (req, res) => res.redirect(BASE + "/")); } else host.use(site);

pool.query("SELECT COUNT(*) n FROM products")
  .then(([[r]]) => {
    site.startBackground();
    host.listen(PORT, () => {
      const url = `http://localhost:${PORT}${BASE}/`;
      const smtp = cfg.smtp();
      console.log(`\nTanjo Foods running  ->  ${url}`);
      console.log(`  Shop:   ${url}#/shop`);
      console.log(`  Admin:  ${url}admin.html`);
      console.log(`  DB ${cfg.db.name} as ${cfg.db.user} · ${r.n} products · payments: ${cfg.paymentMode()} · e-mail: ${smtp.host ? "SMTP" : "api/outbox folder"}\n`);
    });
  })
  .catch(e => {
    console.error(`\nCannot reach the ${cfg.db.name} database: ${e.message}`);
    console.error("Run  npm run setup-db  first, and check DB_* values in api/.env\n");
    process.exit(1);
  });
