/**
 * Product photos
 * --------------
 * All product photos live in ONE folder (PRODUCT_IMAGE_DIR / TANJO_PRODUCT_IMAGE_DIR, default Tanjofoods/product-images),
 * named by SKU:   TF-SN-001.jpg   TF-SN-001_2.jpg   TF-SN-001_3.png   (jpg, jpeg, png, webp)
 *
 *  - Photos uploaded in Admin are saved into this folder with that naming.
 *  - Photos copied into the folder by hand are picked up automatically (folder is re-scanned
 *    at most every 30 seconds when the shop loads products, or immediately via "Scan folder").
 *  - The first photo (TF-SN-001.jpg, else lowest _n) becomes the main photo on the website.
 *  - Deleted photos are moved to the _deleted sub-folder, never destroyed.
 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../db");

const cfg = require("../config");
const DIR = path.resolve(cfg.imageDir() || path.join(__dirname, "..", "..", "product-images"));
const URL_PREFIX = "product-images/";            // relative: works at / and at /v1/tanjo/
const EXT = /\.(jpe?g|png|webp)$/i;
fs.mkdirSync(DIR, { recursive: true });

/** Parse "TF-SN-001_2.jpg" -> { sku: "TF-SN-001", n: 2 } given known SKUs (SKUs themselves contain dashes). */
function parse(file, skus) {
  if (!EXT.test(file)) return null;
  const base = file.replace(EXT, "");
  const up = base.toUpperCase();
  for (const sku of skus) {
    const S = sku.toUpperCase();
    if (up === S) return { sku, n: 1 };
    const m = up.startsWith(S) && up.slice(S.length).match(/^[_\- ](\d{1,3})$/);
    if (m) return { sku, n: Number(m[1]) };
  }
  return null;
}

function listFolder() {
  try { return fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch (e) { return []; }
}

/**
 * Sync the folder with the product_images table:
 *  - adds rows for new SKU-named files, removes rows whose folder file is gone
 *  - folder photos take priority over the starter photos in assets/img
 * Returns a summary {matched, added, removed, unmatched[]}
 */
async function scan() {
  const [prods] = await pool.query("SELECT product_id, sku, name_en FROM products");
  const skus = prods.map(p => p.sku).sort((a, b) => b.length - a.length);   // longest first
  const bySku = Object.fromEntries(prods.map(p => [p.sku, p]));
  const files = listFolder();
  const found = {}; const unmatched = [];
  for (const f of files) {
    const m = parse(f, skus);
    if (!m) { if (EXT.test(f)) unmatched.push(f); continue; }
    (found[m.sku] = found[m.sku] || []).push({ file: f, n: m.n });
  }
  let added = 0, removed = 0;
  const [rows] = await pool.query("SELECT image_id, product_id, file_name, is_primary FROM product_images");
  const existing = new Set(rows.map(r => r.file_name));
  // remove rows for folder files that no longer exist
  for (const r of rows) {
    if (r.file_name.startsWith(URL_PREFIX) && !files.includes(r.file_name.slice(URL_PREFIX.length))) {
      await pool.query("DELETE FROM product_images WHERE image_id = ?", [r.image_id]); removed++;
    }
  }
  for (const [sku, list] of Object.entries(found)) {
    const p = bySku[sku];
    list.sort((a, b) => a.n - b.n || a.file.localeCompare(b.file));
    for (const [i, it] of list.entries()) {
      const url = URL_PREFIX + it.file;
      if (!existing.has(url)) {
        await pool.query("INSERT INTO product_images (product_id, file_name, alt_text, is_primary, sort_order) VALUES (?,?,?,0,?)",
          [p.product_id, url, p.name_en, i]); added++;
      } else {
        await pool.query("UPDATE product_images SET sort_order = ? WHERE file_name = ?", [i, url]);
      }
    }
    // folder photo #1 is the main photo unless an admin has picked another folder photo as main
    const [[prim]] = await pool.query("SELECT file_name FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1", [p.product_id]);
    if (!prim || !prim.file_name.startsWith(URL_PREFIX) || !files.includes(prim.file_name.slice(URL_PREFIX.length))) {
      await setPrimary(p.product_id, URL_PREFIX + list[0].file);
    }
  }
  // products that lost all folder photos: fall back to any remaining image as primary
  for (const p of prods) {
    const [[prim]] = await pool.query("SELECT COUNT(*) n FROM product_images WHERE product_id = ? AND is_primary = 1", [p.product_id]);
    if (!prim.n) await pool.query("UPDATE product_images SET is_primary = 1 WHERE product_id = ? ORDER BY sort_order, image_id LIMIT 1", [p.product_id]);
  }
  lastScan = Date.now();
  return { folder: DIR, files: files.length, matched: Object.values(found).reduce((a, l) => a + l.length, 0), added, removed, unmatched };
}

async function setPrimary(productId, fileName) {
  await pool.query("UPDATE product_images SET is_primary = (file_name = ?) WHERE product_id = ?", [fileName, productId]);
}

let lastScan = 0, scanning = null;
/** Called by the storefront: re-scan at most every 30 s so hand-copied photos appear almost immediately. */
async function scanIfStale() {
  if (Date.now() - lastScan < 30_000) return;
  if (!scanning) scanning = scan().catch(e => console.error("[images] scan failed:", e.message)).finally(() => { scanning = null; });
  await scanning;
}

/** Save an uploaded photo for a SKU as the next free number. Returns the URL. */
function saveUpload(sku, buffer, originalName) {
  const ext = (path.extname(originalName || "").toLowerCase().match(/\.(jpe?g|png|webp)$/) || [".jpg"])[0].replace(".jpeg", ".jpg");
  const taken = new Set(listFolder().map(f => f.toLowerCase()));
  let name;
  if (![".jpg", ".png", ".webp"].some(e => taken.has((sku + e).toLowerCase()))) name = sku + ext;
  else { let n = 2; while ([".jpg", ".png", ".webp"].some(e => taken.has(`${sku}_${n}${e}`.toLowerCase()))) n++; name = `${sku}_${n}${ext}`; }
  fs.writeFileSync(path.join(DIR, name), buffer);
  return URL_PREFIX + name;
}

/** Move a folder photo to _deleted (kept for safety). */
function removeFile(url) {
  if (!url.startsWith(URL_PREFIX)) return false;
  const name = path.basename(url);
  const src = path.join(DIR, name);
  if (!fs.existsSync(src)) return false;
  const bin = path.join(DIR, "_deleted"); fs.mkdirSync(bin, { recursive: true });
  fs.renameSync(src, path.join(bin, `${Date.now()}_${name}`));
  return true;
}

module.exports = { DIR, URL_PREFIX, scan, scanIfStale, saveUpload, removeFile, setPrimary };
