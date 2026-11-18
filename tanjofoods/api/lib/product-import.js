/**
 * Excel product import (the client template: sheet "Products", headers in row 1).
 * Two steps:  validate(buffer) -> preview stored in product_import_batches/rows
 *             apply(batchId)   -> insert new / update existing products by SKU
 * Blank cells never wipe existing data – they leave the current value unchanged.
 * Price changes go through prices.setPrice (kept in price history, source IMPORT).
 */
const fs = require("fs");
const path = require("path");
const { readSheet } = require("./xlsx-read");
const { pool, tx } = require("../db");
const { setPrice } = require("./prices");
const { audit } = require("./auth");
const images = require("./images");

const KEYMAP = {
  "SKU": "sku", "Category": "category", "Product Name (English)": "name_en", "Product Name (French)": "name_fr",
  "Regional / Indian Name": "regional_name", "Short Description (English)": "short_desc_en",
  "Short Description (French)": "short_desc_fr", "Ingredients (English)": "ingredients_en",
  "Ingredients (French)": "ingredients_fr", "Allergens (Contains)": "allergens", "May Contain": "may_contain",
  "Dietary Tags": "dietary_tags", "Spice Level (0-3)": "spice_level", "Product Type": "prep_type",
  "Storage": "storage_type", "Shelf Life (days)": "shelf_life_days",
  "Heating / Serving Instructions": "heating_instructions", "Pack Size Value": "pack_size_value",
  "Pack Size Unit": "pack_size_unit", "Pack Size Label": "pack_size_label", "Units per Case": "units_per_case",
  "UPC Barcode": "upc_barcode", "Retail Price (CAD)": "price", "Compare-at Price (CAD)": "compare_at_price",
  "Wholesale Price (CAD)": "wholesale_price", "Taxable (Y/N)": "is_taxable", "Max Qty per Order": "max_order_qty",
  "Status": "status", "Featured (Y/N)": "is_featured", "Sort Order": "sort_order",
  "Image File Name(s)": "images", "Opening Stock Qty": "opening_stock", "Comments / Questions": "comments",
};
const REQUIRED_NEW = ["category", "name_en", "name_fr", "short_desc_en", "prep_type", "storage_type", "pack_size_label", "price", "is_taxable", "status"];
const ENUMS = {
  category: ["SNACKS", "FROZEN", "RTE", "SAUCES", "BEV"], prep_type: ["READY_TO_EAT", "READY_TO_COOK", "READY_TO_DRINK"],
  storage_type: ["AMBIENT", "CHILLED", "FROZEN"], pack_size_unit: ["g", "kg", "ml", "L", "pcs", "pack"],
  status: ["DRAFT", "ACTIVE", "COMING_SOON", "OUT_OF_STOCK", "HIDDEN", "DISCONTINUED"],
};
const NUM = ["price", "compare_at_price", "wholesale_price", "pack_size_value"];
const INT = ["spice_level", "shelf_life_days", "units_per_case", "max_order_qty", "sort_order", "opening_stock"];
const YN = ["is_taxable", "is_featured"];
// columns written to the products table (besides price/compare_at which go through setPrice)
const COLS = ["name_en", "name_fr", "regional_name", "short_desc_en", "short_desc_fr", "ingredients_en", "ingredients_fr",
  "allergens", "may_contain", "dietary_tags", "spice_level", "prep_type", "storage_type", "shelf_life_days", "heating_instructions",
  "pack_size_value", "pack_size_unit", "pack_size_label", "units_per_case", "upc_barcode", "wholesale_price", "is_taxable",
  "max_order_qty", "status", "is_featured", "sort_order"];
const PREFIX = { SNACKS: "TF-SN", FROZEN: "TF-FZ", RTE: "TF-RT", SAUCES: "TF-SC", BEV: "TF-BV" };

const blank = v => v == null || (typeof v === "string" && v.trim() === "");
const slugify = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function readRows(buffer) {
  const ws = await readSheet(buffer, "Products");
  const headers = {};
  for (let c = 1; c <= ws.colCount; c++) { const k = KEYMAP[String(ws.get(1, c) || "").replace(/\s*\*$/, "").trim()]; if (k) headers[c] = k; }
  if (!Object.values(headers).includes("sku") || !Object.values(headers).includes("name_en"))
    throw Object.assign(new Error("This doesn't look like the Tanjo Foods product template (headers not found in row 1 of the Products sheet)."), { status: 400 });
  const first = /unique code/i.test(String(ws.get(2, 1) || "")) ? 3 : 2;
  const rows = [];
  for (let r = first; r <= ws.rowCount; r++) {
    const rec = {}; let any = false;
    for (const [col, key] of Object.entries(headers)) {
      let v = ws.get(r, Number(col));
      if (typeof v === "string") v = v.trim();
      if (!blank(v)) { rec[key] = v; any = true; }
    }
    if (any) { rec._row = r; rows.push(rec); }
  }
  return rows;
}

/** Validate + compare with the DB. Returns { batchId, summary, rows:[{row, sku, name, action, changes[], errors[]}] } */
async function validate(buffer, fileName, adminId) {
  const rows = await readRows(buffer);
  const [prods] = await pool.query("SELECT p.*, c.code AS category FROM products p JOIN categories c ON c.category_id = p.category_id");
  const bySku = Object.fromEntries(prods.map(p => [p.sku.toUpperCase(), p]));
  const used = new Set(prods.map(p => p.sku.toUpperCase()));
  const seen = new Set();
  const out = [];
  for (const rec of rows) {
    const errors = [], changes = [];
    for (const k of NUM) if (!blank(rec[k])) { const n = Number(String(rec[k]).replace(/[$,]/g, "")); if (isNaN(n)) errors.push(`${k} "${rec[k]}" is not a number`); else rec[k] = Math.round(n * 100) / 100; }
    for (const k of INT) if (!blank(rec[k])) { const n = parseInt(rec[k], 10); if (isNaN(n)) errors.push(`${k} "${rec[k]}" is not a whole number`); else rec[k] = n; }
    for (const k of YN) if (!blank(rec[k])) rec[k] = /^y/i.test(String(rec[k])) ? 1 : 0;
    for (const [k, list] of Object.entries(ENUMS)) if (!blank(rec[k])) {
      const hit = list.find(x => x.toUpperCase() === String(rec[k]).toUpperCase());
      if (!hit) errors.push(`${k} "${rec[k]}" must be one of ${list.join(", ")}`); else rec[k] = hit;
    }
    if (!blank(rec.price) && rec.price < 0) errors.push("price cannot be negative");
    let sku = blank(rec.sku) ? null : String(rec.sku).toUpperCase();
    let matchedByName = false;
    if (!sku && !blank(rec.name_en)) {     // no SKU: match an existing product by English name (avoids duplicates on re-upload)
      const hit = prods.find(p => p.name_en.trim().toLowerCase() === String(rec.name_en).trim().toLowerCase());
      if (hit) { sku = hit.sku.toUpperCase(); matchedByName = true; }
    }
    const existing = sku ? bySku[sku] : null;
    if (sku && seen.has(sku)) errors.push(`duplicate SKU ${sku} in the file`);
    const draft = ["DRAFT", "HIDDEN"].includes(String(rec.status || (existing && existing.status) || "").toUpperCase());
    if (!existing) for (const k of REQUIRED_NEW) {
      if (draft && (k === "price" || k === "pack_size_label")) continue;          // drafts may wait for price / pack size
      if (blank(rec[k])) errors.push(`${k} is required for a new product`);
    }
    const finalPrice = !blank(rec.price) ? rec.price : existing ? Number(existing.price) : 0;
    if (!draft && !(finalPrice > 0) && !errors.length) errors.push("a price is needed before the product can be ACTIVE / COMING_SOON (or set Status to DRAFT)");
    if (existing && rec.category && rec.category !== existing.category) changes.push({ field: "category", from: existing.category, to: rec.category });
    if (!sku && rec.category && PREFIX[rec.category]) {           // assign next SKU
      let n = 1; while (used.has(`${PREFIX[rec.category]}-${String(n).padStart(3, "0")}`)) n++;
      sku = `${PREFIX[rec.category]}-${String(n).padStart(3, "0")}`;
    }
    if (sku) { seen.add(sku); used.add(sku); rec.sku = sku; }
    if (matchedByName) changes.unshift({ field: "sku", from: "(blank)", to: `${sku} – matched by product name` });
    if (existing) {
      for (const k of [...COLS, "price", "compare_at_price"]) {
        if (blank(rec[k])) continue;
        const a = existing[k] == null ? null : (typeof rec[k] === "number" ? Number(existing[k]) : String(existing[k]));
        if (a !== rec[k]) changes.push({ field: k, from: existing[k], to: rec[k] });
      }
    }
    const real = changes.filter(c => c.field !== "sku");
    const action = errors.length ? "SKIP" : existing ? (real.length ? "UPDATE" : "SKIP") : "INSERT";
    out.push({ row: rec._row, sku: sku || "", name: rec.name_en || existing?.name_en || "", action, changes, errors, data: rec,
               unchanged: !errors.length && existing && !real.length });
  }
  const summary = {
    total: out.length, insert: out.filter(r => r.action === "INSERT").length, update: out.filter(r => r.action === "UPDATE").length,
    unchanged: out.filter(r => r.unchanged).length, errors: out.filter(r => r.errors.length).length,
  };
  const batchId = await tx(async conn => {
    const [b] = await conn.query("INSERT INTO product_import_batches (file_name, rows_total, rows_ok, rows_error, status, uploaded_by) VALUES (?,?,?,?,'VALIDATED',?)",
      [String(fileName || "upload.xlsx").slice(0, 255), summary.total, summary.total - summary.errors, summary.errors, adminId]);
    for (const r of out) await conn.query("INSERT INTO product_import_rows (batch_id, excel_row, sku, payload, errors, action) VALUES (?,?,?,?,?,?)",
      [b.insertId, r.row, r.sku || null, JSON.stringify(r.data), r.errors.join("; ").slice(0, 1000) || null, r.action]);
    return b.insertId;
  });
  await audit(null, adminId, "import", batchId, "IMPORT_VALIDATED", null, { file: fileName, ...summary });
  return { batchId, summary, rows: out.map(({ data, ...r }) => r) };
}

async function apply(batchId, adminId) {
  const [[batch]] = await pool.query("SELECT * FROM product_import_batches WHERE batch_id = ?", [batchId]);
  if (!batch) throw Object.assign(new Error("Import not found"), { status: 404 });
  if (batch.status !== "VALIDATED") throw Object.assign(new Error(`This import is already ${batch.status.toLowerCase()}`), { status: 409 });
  const [rows] = await pool.query("SELECT * FROM product_import_rows WHERE batch_id = ? AND action IN ('INSERT','UPDATE') ORDER BY excel_row", [batchId]);
  const assetDir = path.join(__dirname, "..", "..", "assets", "img");
  let inserted = 0, updated = 0, priceChanges = 0;
  await tx(async conn => {
    for (const row of rows) {
      const d = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      const [[ex]] = await conn.query("SELECT product_id FROM products WHERE sku = ? FOR UPDATE", [d.sku]);
      let productId;
      if (!ex) {
        const cols = ["sku", "category_id", "slug", "price", "compare_at_price", ...COLS.filter(k => !blank(d[k]))];
        const vals = cols.map(k => k === "category_id" ? null : k === "slug" ? slugify(`${d.name_en}-${d.sku}`) : k === "price" ? (d.price || 0) : d[k] ?? null);
        const ph = cols.map(k => k === "category_id" ? "(SELECT category_id FROM categories WHERE code = ?)" : "?");
        vals[cols.indexOf("category_id")] = d.category;
        const [r] = await conn.query(`INSERT INTO products (${cols.join(",")}) VALUES (${ph.join(",")})`, vals);
        productId = r.insertId;
        if (d.price > 0) await conn.query("INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note, changed_by) VALUES (?,?,?,NOW(),1,'IMPORT',?,?)",
          [productId, d.price, d.compare_at_price ?? null, `Import #${batchId}`, adminId]);
        await conn.query("INSERT INTO inventory (product_id, qty_on_hand, track_inventory) VALUES (?,?,?)",
          [productId, d.opening_stock || 0, d.opening_stock != null ? 1 : 0]);
        if (d.opening_stock) await conn.query("INSERT INTO inventory_transactions (product_id, txn_type, qty, note, created_by) VALUES (?, 'RECEIPT', ?, ?, ?)",
          [productId, d.opening_stock, `Opening stock – import #${batchId}`, adminId]);
        await audit(conn, adminId, "product", d.sku, "PRODUCT_CREATE", null, { source: `import #${batchId}`, name: d.name_en, price: d.price });
        inserted++;
      } else {
        productId = ex.product_id;
        const sets = COLS.filter(k => !blank(d[k]));
        if (d.category) sets.push("category_id");
        if (sets.length) {
          const vals = sets.map(k => k === "category_id" ? d.category : d[k]);
          await conn.query(`UPDATE products SET ${sets.map(k => k === "category_id" ? "category_id = (SELECT category_id FROM categories WHERE code = ?)" : `${k} = ?`).join(", ")} WHERE product_id = ?`,
            [...vals, productId]);
        }
        if ((!blank(d.price) && d.price > 0) || !blank(d.compare_at_price)) {
          const [[cur]] = await conn.query("SELECT price, compare_at_price FROM products WHERE product_id = ?", [productId]);
          const r = await setPrice(conn, { productId, price: blank(d.price) ? cur.price : d.price,
            compareAt: blank(d.compare_at_price) ? cur.compare_at_price : d.compare_at_price, adminId, source: "IMPORT", note: `Import #${batchId}` });
          if (r.changed) priceChanges++;
        }
        await audit(conn, adminId, "product", d.sku, "PRODUCT_UPDATE", null, { source: `import #${batchId}`, fields: sets });
        updated++;
      }
      // starter images named in the sheet that live in assets/img (folder photos are picked up by the scan below)
      for (const f of String(d.images || "").split(";").map(s => s.trim()).filter(Boolean)) {
        if (fs.existsSync(path.join(assetDir, path.basename(f)))) {
          const url = "assets/img/" + path.basename(f);
          const [[has]] = await conn.query("SELECT image_id FROM product_images WHERE product_id = ? AND file_name = ?", [productId, url]);
          if (!has) await conn.query("INSERT INTO product_images (product_id, file_name, alt_text, is_primary, sort_order) VALUES (?,?,?,?,99)",
            [productId, url, d.name_en || d.sku, 0]);
        }
      }
    }
    await conn.query("UPDATE product_import_batches SET status = 'APPLIED', applied_at = NOW() WHERE batch_id = ?", [batchId]);
    await audit(conn, adminId, "import", batchId, "IMPORT_APPLIED", null, { inserted, updated, priceChanges });
  });
  const scan = await images.scan();
  return { inserted, updated, priceChanges, imagesMatched: scan.matched };
}

module.exports = { validate, apply };
