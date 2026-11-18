/**
 * Tanjo Foods – the whole site (shop, admin, API) as one Express app.
 *
 * Works at any address, because every page uses relative links:
 *   - standalone:  node server.js                      -> http://localhost:4100/
 *   - embedded in the Thanjai API (Express 4):
 *         app.use("/tanjo", require("./tanjofoods/api/app"));   -> https://pm.thanjaicaterers.com/v1/tanjo/
 *
 * It uses its OWN database (TANJO_DB_* settings, default "Tanjofoods") – never the restaurant database.
 * If that database is unreachable only /tanjo pages fail; the host app keeps running.
 */
const path = require("path");
const express = require("express");
const cfg = require("./config");
const { router: store } = require("./routes/store");
const admin = require("./routes/admin");
const images = require("./lib/images");
const { applyDuePrices } = require("./lib/prices");

const app = express();
const SITE = path.join(__dirname, "..");          // the Tanjofoods folder (index.html, assets, data ...)

app.disable("x-powered-by");
app.set("trust proxy", true);

// "/v1/tanjo" -> "/v1/tanjo/" so the pages' relative links resolve inside this app
app.use((req, res, next) => {
  const [p, q] = req.originalUrl.split("?");
  if (req.path === "/" && !p.endsWith("/") && (req.method === "GET" || req.method === "HEAD"))
    return res.redirect(301, p + "/" + (q ? "?" + q : ""));
  next();
});

app.use(express.json({ limit: "100kb" }));

// ---- API ----
app.use("/api/admin", admin);
app.use("/api", store);
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

// ---- Website: only the public files (never api/, database/, tools/, templates/) ----
const opts = { maxAge: "1h", index: false };
app.use("/assets", express.static(path.join(SITE, "assets"), opts));
app.use("/data", express.static(path.join(SITE, "data"), { ...opts, maxAge: 0 }));
app.use("/product-images", express.static(images.DIR, { index: false, maxAge: 0, dotfiles: "deny" }));
for (const f of ["index.html", "mock-pay.html", "admin.html"]) app.get("/" + f, (req, res) => res.sendFile(path.join(SITE, f)));
app.get("/", (req, res) => res.sendFile(path.join(SITE, "index.html")));
app.use((req, res) => res.status(404).send("Not found"));

// ---- errors (kept inside this app – never handed to the host app) ----
app.use((err, req, res, next) => {
  const status = err.status || (err.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error("[tanjo error]", req.method, req.originalUrl, err && (err.stack || err.message));
  res.status(status).json({ error: status >= 500 ? "Something went wrong – please try again." : err.message });
});

/* Background jobs: photo-folder scan and scheduled prices. Started once, failures only logged. */
let started = false;
app.startBackground = function () {
  if (started) return; started = true;
  const run = () => {
    images.scan().then(s => console.info(`[tanjo] ${s.matched} photo(s) in ${s.folder}`)).catch(e => console.error("[tanjo] photo scan:", e.message));
    applyDuePrices(true).catch(e => console.error("[tanjo] prices:", e.message));
  };
  setTimeout(run, 3000);
  setInterval(() => applyDuePrices(true).catch(() => {}), 5 * 60_000).unref();
};
if (!cfg.standalone) app.startBackground();

module.exports = app;
