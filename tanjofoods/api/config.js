/**
 * Settings for Tanjo Foods.
 *
 *  Standalone (npm start in Tanjofoods/api, its own .env):   plain names, e.g. DB_HOST, SMTP_HOST
 *  Embedded in the Thanjai API (pm.thanjaicaterers.com/v1/tanjo): only TANJO_-prefixed names are read,
 *      e.g. TANJO_DB_HOST, TANJO_SMTP_HOST – so the restaurant's own DB / mail settings are never picked up.
 *  In standalone mode a TANJO_ name still wins over the plain one.
 */
const standalone = process.env.TANJO_STANDALONE === "1";

function env(name, def) {
  const p = process.env["TANJO_" + name];
  if (p != null && p !== "") return p;
  if (standalone) { const v = process.env[name]; if (v != null && v !== "") return v; }
  return def;
}

module.exports = {
  standalone,
  env,
  db: {
    host: env("DB_HOST", "localhost"),
    port: Number(env("DB_PORT", 3306)),
    name: env("DB_NAME", "Tanjofoods"),
    user: env("DB_USER", "tanjo_app"),
    password: env("DB_PASSWORD", ""),
  },
  publicUrl: () => env("PUBLIC_URL", ""),          // e.g. https://pm.thanjaicaterers.com/v1/tanjo  (used in e-mail links)
  paymentMode: () => env("PAYMENT_MODE", "MOCK"),
  imageDir: () => env("PRODUCT_IMAGE_DIR", ""),
  smtp: () => ({
    host: env("SMTP_HOST", ""), port: Number(env("SMTP_PORT", 587)), secure: String(env("SMTP_SECURE", "false")) === "true",
    user: env("SMTP_USER", ""), pass: env("SMTP_PASSWORD", env("SMTP_PASS", "")),
    from: env("MAIL_FROM", "Tanjo Foods <info@tanjofoods.com>"),
  }),
};
