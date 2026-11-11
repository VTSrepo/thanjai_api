// Loads store settings, taxes, delivery zones and slots from the DB (cached 60 s)
const { pool } = require("../db");

let cache = null, cachedAt = 0;

async function load(force = false) {
  if (!force && cache && Date.now() - cachedAt < 60_000) return cache;
  const [settingsRows] = await pool.query("SELECT setting_key, setting_value FROM settings");
  const s = Object.fromEntries(settingsRows.map(r => [r.setting_key, r.setting_value]));
  const [taxes] = await pool.query(
    "SELECT code, name, rate FROM tax_rates WHERE is_active = 1 AND province = 'QC' AND effective_from <= CURDATE() ORDER BY sort_order");
  const [zones] = await pool.query("SELECT * FROM delivery_zones WHERE is_active = 1");
  const [slots] = await pool.query(
    "SELECT DISTINCT TIME_FORMAT(start_time,'%H:%i') st, TIME_FORMAT(end_time,'%H:%i') et FROM delivery_slots WHERE is_active = 1 ORDER BY st");
  cache = {
    settings: s,
    taxes: taxes.map(t => ({ code: t.code, name: t.name, rate: Number(t.rate) })),
    zones: zones.map(z => ({ ...z, prefixes: z.postal_prefixes.split(",").map(p => p.trim().toUpperCase()).filter(Boolean) })),
    slots: slots.map(r => `${r.st} – ${r.et}`),
    minOrder: Number(s.min_order_amount || 0),
    defaultDeliveryFee: Number(s.default_delivery_fee || 0),
    freeDeliveryOver: s.free_delivery_over ? Number(s.free_delivery_over) : null,
    leadDays: Number(s.order_lead_days || 1),
    prefix: s.order_prefix || "TF",
  };
  cachedAt = Date.now();
  return cache;
}

/** Find the delivery zone for a Canadian postal code (by its first 3 chars, the FSA). */
function zoneFor(cfg, postal) {
  const fsa = String(postal || "").replace(/\s+/g, "").toUpperCase().slice(0, 3);
  return cfg.zones.find(z => z.prefixes.includes(fsa)) || null;
}

module.exports = { load, zoneFor };
