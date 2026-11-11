// Price changes with full history (effective from / to dates) and scheduled future prices
const { pool, tx } = require("../db");
const { audit } = require("./auth");

const r2 = n => (n == null || n === "" ? null : Math.round(Number(n) * 100) / 100);

/**
 * Change a product's price.
 *  effectiveFrom: null/'' or a date (YYYY-MM-DD) <= today  -> applied now
 *                 a future date                             -> scheduled (applied automatically on that date)
 * Must be called inside a transaction (conn). Returns { changed, scheduled }.
 */
async function setPrice(conn, { productId, price, compareAt, effectiveFrom, adminId, source = "ADMIN", note = null }) {
  price = r2(price); compareAt = r2(compareAt);
  if (!(price > 0)) throw Object.assign(new Error("Price must be greater than 0"), { status: 400 });
  if (compareAt != null && compareAt <= price) compareAt = null;   // a 'was' price only makes sense above the price
  const [[p]] = await conn.query("SELECT product_id, sku, price, compare_at_price FROM products WHERE product_id = ? FOR UPDATE", [productId]);
  if (!p) throw Object.assign(new Error("Product not found"), { status: 404 });

  const [[{ today }]] = await conn.query("SELECT CURDATE() AS today");
  const future = effectiveFrom && /^\d{4}-\d{2}-\d{2}/.test(effectiveFrom) && effectiveFrom.slice(0, 10) > today;

  if (future) {
    // one scheduled price per product per date – a new one for the same date replaces the old
    await conn.query("DELETE FROM product_price_history WHERE product_id = ? AND is_applied = 0 AND DATE(effective_from) = ?", [productId, effectiveFrom.slice(0, 10)]);
    await conn.query(
      `INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note, changed_by)
       VALUES (?,?,?,?,0,?,?,?)`, [productId, price, compareAt, effectiveFrom.slice(0, 10) + " 00:00:00", source, note, adminId || null]);
    await audit(conn, adminId, "product", p.sku, "PRICE_SCHEDULED", { price: p.price }, { price, compare_at_price: compareAt, effective_from: effectiveFrom.slice(0, 10) });
    return { changed: false, scheduled: true };
  }
  if (Number(p.price) === price && r2(p.compare_at_price) === compareAt) return { changed: false, scheduled: false };

  await ensureOpenRow(conn, p);
  await conn.query("UPDATE product_price_history SET effective_to = NOW() WHERE product_id = ? AND is_applied = 1 AND effective_to IS NULL", [productId]);
  await conn.query(
    `INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note, changed_by)
     VALUES (?,?,?,NOW(),1,?,?,?)`, [productId, price, compareAt, source, note, adminId || null]);
  await conn.query("UPDATE products SET price = ?, compare_at_price = ? WHERE product_id = ?", [price, compareAt, productId]);
  await audit(conn, adminId, "product", p.sku, "PRICE_CHANGE",
    { price: Number(p.price), compare_at_price: r2(p.compare_at_price) }, { price, compare_at_price: compareAt, source });
  return { changed: true, scheduled: false };
}

/** Make sure a product has an open history row for its current price (older data / manual SQL edits). */
async function ensureOpenRow(conn, p) {
  const [[open]] = await conn.query("SELECT price_id FROM product_price_history WHERE product_id = ? AND is_applied = 1 AND effective_to IS NULL", [p.product_id]);
  if (!open) await conn.query(
    `INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note)
     SELECT product_id, price, compare_at_price, created_at, 1, 'INITIAL', 'Price before history tracking' FROM products WHERE product_id = ? AND price > 0`, [p.product_id]);
}

/** Apply any scheduled prices whose date has arrived. Cheap – safe to call often. */
let lastRun = 0;
async function applyDuePrices(force = false) {
  if (!force && Date.now() - lastRun < 60_000) return 0;
  lastRun = Date.now();
  const [due] = await pool.query("SELECT price_id FROM product_price_history WHERE is_applied = 0 AND effective_from <= NOW() ORDER BY effective_from, price_id");
  for (const { price_id } of due) {
    await tx(async conn => {
      const [[h]] = await conn.query("SELECT * FROM product_price_history WHERE price_id = ? AND is_applied = 0 FOR UPDATE", [price_id]);
      if (!h) return;
      const [[p]] = await conn.query("SELECT product_id, sku, price, compare_at_price FROM products WHERE product_id = ? FOR UPDATE", [h.product_id]);
      await ensureOpenRow(conn, p);
      // cut-off = the scheduled date, but never before the current price started (keeps periods in order)
      const [[open]] = await conn.query("SELECT effective_from FROM product_price_history WHERE product_id = ? AND is_applied = 1 AND effective_to IS NULL ORDER BY price_id DESC LIMIT 1", [h.product_id]);
      const cut = open && String(open.effective_from) > String(h.effective_from) ? open.effective_from : h.effective_from;
      await conn.query("UPDATE product_price_history SET effective_to = ? WHERE product_id = ? AND is_applied = 1 AND effective_to IS NULL", [cut, h.product_id]);
      await conn.query("UPDATE product_price_history SET is_applied = 1, effective_from = ? WHERE price_id = ?", [cut, price_id]);
      await conn.query("UPDATE products SET price = ?, compare_at_price = ? WHERE product_id = ?", [h.price, h.compare_at_price, h.product_id]);
      await audit(conn, null, "product", p.sku, "PRICE_APPLIED", { price: Number(p.price) }, { price: Number(h.price), scheduled_price_id: price_id });
      console.log(`[price] ${p.sku}: scheduled price $${h.price} applied (effective ${h.effective_from})`);
    });
  }
  return due.length;
}

module.exports = { setPrice, applyDuePrices, ensureOpenRow };
