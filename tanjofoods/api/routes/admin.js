// Admin API:  /api/admin/...   – sign in with e-mail + password (admin_users); every change is logged with the user
const express = require("express");
const path = require("path");
const multer = require("multer");
const { pool, tx } = require("../db");
const auth = require("../lib/auth");
const { hashPassword, verifyPassword, passwordProblem } = require("../lib/passwords");
const { setPrice, applyDuePrices } = require("../lib/prices");
const images = require("../lib/images");
const importer = require("../lib/product-import");
const { REPORTS, toCsv } = require("../lib/reports");

const router = express.Router();
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blank = v => v == null || (typeof v === "string" && v.trim() === "");

const uploadImages = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => cb(/^image\/(jpeg|png|webp)$/.test(f.mimetype) ? null : bad("Photos must be JPG, PNG or WebP"), true) });
const uploadXlsx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/* ================================================================== AUTH */
router.post("/login", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase(), password = String(req.body?.password || "");
  const key = email + "|" + req.ip;
  if (auth.throttled(key)) throw bad("Too many failed attempts – try again in 15 minutes.", 429);
  const [[u]] = await pool.query("SELECT * FROM admin_users WHERE email = ?", [email]);
  if (!u || !u.is_active || !verifyPassword(password, u.password_hash)) {
    auth.recordFail(key);
    if (u) await auth.audit(null, u.admin_id, "user", u.admin_id, "LOGIN_FAILED", null, { ip: req.ip });
    throw bad("Wrong e-mail or password.", 401);
  }
  auth.clearFails(key);
  const token = await auth.createSession(u.admin_id, req);
  await pool.query("UPDATE admin_users SET last_login_at = NOW() WHERE admin_id = ?", [u.admin_id]);
  await auth.audit(null, u.admin_id, "user", u.admin_id, "LOGIN", null, { ip: req.ip });
  res.json({ token, user: { admin_id: u.admin_id, full_name: u.full_name, email: u.email } });
}));

router.use(auth.requireAdmin);   // ---- everything below needs a signed-in user ----
for (const prm of ["id", "img", "pid", "batch"]) router.param(prm, (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(404).json({ error: "Not found" })));

router.get("/me", (req, res) => res.json(req.admin));
router.post("/logout", wrap(async (req, res) => {
  await auth.endSession(req.sessionToken);
  await auth.audit(null, req.admin.admin_id, "user", req.admin.admin_id, "LOGOUT", null, null);
  res.json({ ok: true });
}));
router.post("/me/password", wrap(async (req, res) => {
  const { current, password } = req.body || {};
  const [[u]] = await pool.query("SELECT password_hash FROM admin_users WHERE admin_id = ?", [req.admin.admin_id]);
  if (!verifyPassword(current, u.password_hash)) throw bad("Current password is wrong.");
  const p = passwordProblem(password); if (p) throw bad(p);
  await pool.query("UPDATE admin_users SET password_hash = ? WHERE admin_id = ?", [hashPassword(password), req.admin.admin_id]);
  await auth.audit(null, req.admin.admin_id, "user", req.admin.admin_id, "PASSWORD_CHANGED", null, null);
  res.json({ ok: true });
}));

/* ================================================================== USERS */
router.get("/users", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT u.admin_id, u.full_name, u.email, u.is_active, u.last_login_at, u.created_at,
            (SELECT COUNT(*) FROM audit_log l WHERE l.admin_id = u.admin_id AND l.action = 'ORDER_STATUS') AS status_changes
       FROM admin_users u ORDER BY u.is_active DESC, u.full_name`);
  res.json(rows);
}));
router.post("/users", wrap(async (req, res) => {
  const name = String(req.body?.full_name || "").trim(), email = String(req.body?.email || "").trim().toLowerCase(), pw = req.body?.password;
  if (!name || !EMAIL_RE.test(email)) throw bad("Enter a name and a valid e-mail.");
  const p = passwordProblem(pw); if (p) throw bad(p);
  const [[dup]] = await pool.query("SELECT admin_id FROM admin_users WHERE email = ?", [email]);
  if (dup) throw bad("A user with this e-mail already exists.", 409);
  const [r] = await pool.query("INSERT INTO admin_users (full_name, email, password_hash, role) VALUES (?,?,?, 'MANAGER')", [name.slice(0, 120), email, hashPassword(pw)]);
  await auth.audit(null, req.admin.admin_id, "user", r.insertId, "USER_CREATED", null, { full_name: name, email });
  res.status(201).json({ admin_id: r.insertId });
}));
router.patch("/users/:id", wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  const [[u]] = await pool.query("SELECT admin_id, full_name, email, is_active FROM admin_users WHERE admin_id = ?", [id]);
  if (!u) throw bad("User not found", 404);
  const sets = [], args = [], changes = {};
  if (!blank(b.full_name) && b.full_name.trim() !== u.full_name) { sets.push("full_name = ?"); args.push(b.full_name.trim().slice(0, 120)); changes.full_name = b.full_name.trim(); }
  if (b.is_active != null && !!b.is_active !== !!u.is_active) {
    if (id === req.admin.admin_id) throw bad("You can't deactivate yourself.");
    sets.push("is_active = ?"); args.push(b.is_active ? 1 : 0); changes.is_active = !!b.is_active;
  }
  if (!blank(b.password)) { const p = passwordProblem(b.password); if (p) throw bad(p); sets.push("password_hash = ?"); args.push(hashPassword(b.password)); changes.password = "reset"; }
  if (!sets.length) return res.json({ ok: true });
  await pool.query(`UPDATE admin_users SET ${sets.join(", ")} WHERE admin_id = ?`, [...args, id]);
  if (changes.is_active === false || changes.password) await pool.query("DELETE FROM admin_sessions WHERE admin_id = ? AND admin_id <> ?", [id, req.admin.admin_id]);
  await auth.audit(null, req.admin.admin_id, "user", id, "USER_UPDATED", { full_name: u.full_name, is_active: !!u.is_active }, changes);
  res.json({ ok: true });
}));

/* ================================================================== ORDERS */
router.get("/summary", wrap(async (req, res) => {
  const [[t]] = await pool.query(
    `SELECT COUNT(*) orders_today, COALESCE(SUM(CASE WHEN payment_status='PAID' OR payment_method='PAY_ON_DELIVERY' THEN grand_total END),0) sales_today
       FROM orders WHERE DATE(created_at) = CURDATE() AND status <> 'CANCELLED'`);
  const [[open]] = await pool.query("SELECT COUNT(*) n FROM orders WHERE status IN ('CONFIRMED','PREPARING','READY','OUT_FOR_DELIVERY')");
  const [[enq]] = await pool.query("SELECT COUNT(*) n FROM enquiries WHERE status = 'NEW'");
  const [[due]] = await pool.query("SELECT COUNT(*) n FROM orders WHERE scheduled_date = CURDATE() AND status NOT IN ('COMPLETED','CANCELLED')");
  res.json({ ...t, open_orders: open.n, new_enquiries: enq.n, due_today: due.n });
}));

router.get("/orders", wrap(async (req, res) => {
  const where = [], args = [];
  if (req.query.status) { where.push("status = ?"); args.push(req.query.status); }
  if (req.query.q) { where.push("(order_no LIKE ? OR cust_name LIKE ? OR cust_email LIKE ? OR cust_phone LIKE ?)"); const q = `%${req.query.q}%`; args.push(q, q, q, q); }
  const [rows] = await pool.query(
    `SELECT order_no, cust_name, cust_phone, cust_email, fulfilment_type, scheduled_date, time_slot, grand_total,
            status, payment_status, payment_method, created_at,
            (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = o.order_id) items,
            (SELECT a.full_name FROM order_status_history h JOIN admin_users a ON a.admin_id = h.changed_by
              WHERE h.order_id = o.order_id ORDER BY h.history_id DESC LIMIT 1) last_by
       FROM orders o ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 300`, args);
  res.json(rows);
}));

router.get("/orders/:no", wrap(async (req, res) => {
  const [[o]] = await pool.query("SELECT * FROM orders WHERE order_no = ?", [req.params.no]);
  if (!o) throw bad("Not found", 404);
  delete o.access_token;
  const [items] = await pool.query("SELECT sku, product_name, pack_size_label, unit_price, qty, is_taxable, line_total FROM order_items WHERE order_id = ?", [o.order_id]);
  const [history] = await pool.query(
    `SELECT h.from_status, h.to_status, h.note, h.changed_at, COALESCE(a.full_name, 'System / customer') AS changed_by
       FROM order_status_history h LEFT JOIN admin_users a ON a.admin_id = h.changed_by WHERE h.order_id = ? ORDER BY h.history_id`, [o.order_id]);
  const [payments] = await pool.query("SELECT provider, provider_ref, txn_type, amount, status, card_brand, card_last4, created_at FROM payments WHERE order_id = ? ORDER BY payment_id", [o.order_id]);
  res.json({ order: o, items, history, payments });
}));

router.patch("/orders/:no/status", wrap(async (req, res) => {
  const { status, note } = req.body || {};
  if (!STATUSES.includes(status)) throw bad("Invalid status");
  await tx(async conn => {
    const [[o]] = await conn.query("SELECT order_id, status FROM orders WHERE order_no = ? FOR UPDATE", [req.params.no]);
    if (!o) throw bad("Not found", 404);
    if (o.status === status) return;
    if (o.status === "CANCELLED") throw bad("Order is already cancelled", 409);
    await conn.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, o.order_id]);
    await conn.query("INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by) VALUES (?,?,?,?,?)",
      [o.order_id, o.status, status, String(note || "").slice(0, 255) || null, req.admin.admin_id]);
    await auth.audit(conn, req.admin.admin_id, "order", req.params.no, "ORDER_STATUS", { status: o.status }, { status, note: note || undefined });
    if (status === "CANCELLED") {   // put tracked stock back
      const [lines] = await conn.query(
        `SELECT oi.product_id, oi.qty FROM order_items oi JOIN inventory i ON i.product_id = oi.product_id AND i.track_inventory = 1 WHERE oi.order_id = ?`, [o.order_id]);
      for (const l of lines) {
        await conn.query("UPDATE inventory SET qty_on_hand = qty_on_hand + ? WHERE product_id = ?", [l.qty, l.product_id]);
        await conn.query("INSERT INTO inventory_transactions (product_id, txn_type, qty, ref_order_id, note, created_by) VALUES (?, 'RETURN', ?, ?, 'Order cancelled', ?)",
          [l.product_id, l.qty, o.order_id, req.admin.admin_id]);
      }
    }
  });
  res.json({ ok: true });
}));

/* ================================================================== ENQUIRIES */
router.get("/enquiries", wrap(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT e.*, a.full_name AS updated_by_name FROM enquiries e LEFT JOIN admin_users a ON a.admin_id = e.updated_by ORDER BY e.created_at DESC LIMIT 300`);
  res.json(rows);
}));
router.patch("/enquiries/:id", wrap(async (req, res) => {
  const s = (req.body || {}).status;
  if (!["NEW", "IN_PROGRESS", "REPLIED", "CLOSED", "SPAM"].includes(s)) throw bad("Invalid status");
  const [[e]] = await pool.query("SELECT status FROM enquiries WHERE enquiry_id = ?", [req.params.id]);
  if (!e) throw bad("Not found", 404);
  await pool.query("UPDATE enquiries SET status = ?, updated_by = ? WHERE enquiry_id = ?", [s, req.admin.admin_id, req.params.id]);
  await auth.audit(null, req.admin.admin_id, "enquiry", req.params.id, "ENQUIRY_STATUS", { status: e.status }, { status: s });
  res.json({ ok: true });
}));

/* ================================================================== PRODUCTS */
const PFIELDS = {   // editable product fields -> type
  name_en: "str", name_fr: "str", regional_name: "str", short_desc_en: "str", short_desc_fr: "str", long_desc_en: "str", long_desc_fr: "str",
  ingredients_en: "str", ingredients_fr: "str", allergens: "str", may_contain: "str", dietary_tags: "str", spice_level: "int",
  prep_type: ["READY_TO_EAT", "READY_TO_COOK", "READY_TO_DRINK"], storage_type: ["AMBIENT", "CHILLED", "FROZEN"],
  shelf_life_days: "int", heating_instructions: "str", pack_size_value: "num", pack_size_unit: ["g", "kg", "ml", "L", "pcs", "pack"],
  pack_size_label: "str", units_per_case: "int", upc_barcode: "str", cost_price: "num", wholesale_price: "num", is_taxable: "bool",
  min_order_qty: "int", max_order_qty: "int", status: ["DRAFT", "ACTIVE", "COMING_SOON", "OUT_OF_STOCK", "HIDDEN", "DISCONTINUED"],
  is_featured: "bool", sort_order: "int",
};
const NOT_NULL_DEFAULTS = { sort_order: 0, min_order_qty: 1, max_order_qty: 20 };   // NOT NULL columns: blank -> default
function cleanFields(b) {
  const out = {};
  for (const [k, t] of Object.entries(PFIELDS)) {
    if (!(k in b)) continue;
    let v = b[k];
    if (blank(v)) { out[k] = t === "bool" ? 0 : k in NOT_NULL_DEFAULTS ? NOT_NULL_DEFAULTS[k] : null; continue; }
    if (Array.isArray(t)) { if (!t.includes(v)) throw bad(`${k}: choose one of ${t.join(", ")}`); out[k] = v; }
    else if (t === "int") { const n = parseInt(v, 10); if (isNaN(n)) throw bad(`${k} must be a whole number`); out[k] = n; }
    else if (t === "num") { const n = Number(v); if (isNaN(n) || n < 0) throw bad(`${k} must be a number`); out[k] = Math.round(n * 100) / 100; }
    else if (t === "bool") out[k] = v === true || v === 1 || v === "1" || v === "Y" || v === "true" ? 1 : 0;
    else out[k] = String(v).trim();
  }
  for (const k of ["name_en", "prep_type", "storage_type", "status"]) if (k in out && out[k] == null) throw bad(`${k} is required`);
  if (out.max_order_qty != null && out.max_order_qty < 1) throw bad("max_order_qty must be at least 1");
  return out;
}
const slugify = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

router.get("/categories", wrap(async (req, res) => {
  const [rows] = await pool.query("SELECT category_id, code, name_en, name_fr, is_active FROM categories ORDER BY is_active DESC, sort_order");
  res.json(rows);
}));

router.get("/products", wrap(async (req, res) => {
  await applyDuePrices();
  const [rows] = await pool.query(
    `SELECT p.product_id, p.sku, p.name_en, p.name_fr, c.code AS category, c.name_en AS category_name, p.pack_size_label, p.price, p.compare_at_price,
            p.status, p.is_featured, p.is_taxable, p.sort_order, p.updated_at,
            i.track_inventory, i.qty_on_hand,
            (SELECT file_name FROM product_images pi WHERE pi.product_id = p.product_id ORDER BY is_primary DESC, sort_order LIMIT 1) AS image,
            (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.product_id) AS image_count,
            (SELECT CONCAT(h.price, ' from ', DATE(h.effective_from)) FROM product_price_history h
              WHERE h.product_id = p.product_id AND h.is_applied = 0 ORDER BY h.effective_from LIMIT 1) AS scheduled_price
       FROM products p JOIN categories c ON c.category_id = p.category_id LEFT JOIN inventory i ON i.product_id = p.product_id
      ORDER BY c.sort_order, p.sort_order, p.name_en`);
  res.json(rows);
}));

async function productDetail(id) {
  const [[p]] = await pool.query(
    `SELECT p.*, c.code AS category, i.track_inventory, i.qty_on_hand, i.reorder_level FROM products p
       JOIN categories c ON c.category_id = p.category_id LEFT JOIN inventory i ON i.product_id = p.product_id WHERE p.product_id = ?`, [id]);
  if (!p) throw bad("Product not found", 404);
  const [imgs] = await pool.query("SELECT image_id, file_name, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, image_id", [id]);
  const [hist] = await pool.query(
    `SELECT h.price_id, h.price, h.compare_at_price, h.effective_from, h.effective_to, h.is_applied, h.source, h.note,
            COALESCE(a.full_name, CASE h.source WHEN 'INITIAL' THEN 'Setup' ELSE 'System' END) AS changed_by
       FROM product_price_history h LEFT JOIN admin_users a ON a.admin_id = h.changed_by WHERE h.product_id = ? ORDER BY h.effective_from DESC, h.price_id DESC`, [id]);
  const [[sold]] = await pool.query(
    `SELECT COALESCE(SUM(oi.qty),0) units, COALESCE(SUM(oi.line_total),0) revenue FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
      WHERE oi.product_id = ? AND o.status <> 'CANCELLED'`, [id]);
  return { product: p, images: imgs, price_history: hist, sold };
}
router.get("/products/template", (req, res) =>
  res.download(path.join(__dirname, "..", "..", "templates", "Tanjo_Foods_Product_Template.xlsx"), "Tanjo_Foods_Product_Template.xlsx"));
router.get("/products/:id", wrap(async (req, res) => res.json(await productDetail(Number(req.params.id)))));

router.post("/products", wrap(async (req, res) => {
  const b = req.body || {};
  const f = cleanFields(b);
  if (blank(f.name_en)) throw bad("name_en is required");
  const [[cat]] = await pool.query("SELECT category_id, code FROM categories WHERE code = ?", [b.category]);
  if (!cat) throw bad("Choose a category");
  const price = blank(b.price) ? 0 : Number(b.price);
  if (isNaN(price) || price < 0) throw bad("Price must be a number");
  if ((!(price > 0) || blank(f.pack_size_label)) && !["DRAFT", "HIDDEN", undefined].includes(f.status))
    throw bad("Set a price and pack size before making the product Active or Coming soon (or save it as Draft).");
  let sku = String(b.sku || "").trim().toUpperCase();
  const prefix = { SNACKS: "TF-SN", FROZEN: "TF-FZ", RTE: "TF-RT", SAUCES: "TF-SC", BEV: "TF-BV" }[cat.code] || "TF-XX";
  const out = await tx(async conn => {
    if (!sku) {
      const [ex] = await conn.query("SELECT sku FROM products WHERE sku LIKE ?", [prefix + "-%"]);
      const used = new Set(ex.map(r => r.sku)); let n = 1; while (used.has(`${prefix}-${String(n).padStart(3, "0")}`)) n++;
      sku = `${prefix}-${String(n).padStart(3, "0")}`;
    } else if (!/^[A-Z0-9][A-Z0-9\-]{2,28}$/.test(sku)) throw bad("SKU may contain only letters, numbers and dashes");
    const [[dup]] = await conn.query("SELECT product_id FROM products WHERE sku = ?", [sku]);
    if (dup) throw bad(`SKU ${sku} already exists`, 409);
    const [[same]] = await conn.query("SELECT sku FROM products WHERE LOWER(TRIM(name_en)) = LOWER(TRIM(?))", [f.name_en]);
    if (same && !b.allow_duplicate_name) throw bad(`A product named "${f.name_en}" already exists (${same.sku}) – open it to edit instead.`, 409);
    const compare = blank(b.compare_at_price) ? null : Number(b.compare_at_price);
    const cols = { sku, category_id: cat.category_id, slug: slugify(`${f.name_en}-${sku}`), price, compare_at_price: compare > price ? compare : null,
                   status: "DRAFT", prep_type: "READY_TO_EAT", storage_type: "AMBIENT", ...f };
    const [r] = await conn.query(`INSERT INTO products (${Object.keys(cols).join(",")}) VALUES (${Object.keys(cols).map(() => "?").join(",")})`, Object.values(cols));
    if (price > 0) await conn.query("INSERT INTO product_price_history (product_id, price, compare_at_price, effective_from, is_applied, source, note, changed_by) VALUES (?,?,?,NOW(),1,'ADMIN','New product',?)",
      [r.insertId, price, cols.compare_at_price, req.admin.admin_id]);
    const qty = parseInt(b.qty_on_hand, 10) || 0, track = b.track_inventory ? 1 : 0;
    await conn.query("INSERT INTO inventory (product_id, qty_on_hand, track_inventory) VALUES (?,?,?)", [r.insertId, qty, track]);
    if (qty) await conn.query("INSERT INTO inventory_transactions (product_id, txn_type, qty, note, created_by) VALUES (?, 'RECEIPT', ?, 'Opening stock', ?)", [r.insertId, qty, req.admin.admin_id]);
    await auth.audit(conn, req.admin.admin_id, "product", sku, "PRODUCT_CREATE", null, { name: f.name_en, price, status: cols.status });
    return r.insertId;
  });
  images.scan().catch(() => {});   // pick up any photos already in the folder for this SKU
  res.status(201).json(await productDetail(out));
}));

router.put("/products/:id", wrap(async (req, res) => {
  const id = Number(req.params.id), b = req.body || {};
  const f = cleanFields(b);
  const result = await tx(async conn => {
    const [[old]] = await conn.query("SELECT p.*, c.code AS category FROM products p JOIN categories c ON c.category_id = p.category_id WHERE p.product_id = ? FOR UPDATE", [id]);
    if (!old) throw bad("Product not found", 404);
    if (b.category && b.category !== old.category) {
      const [[cat]] = await conn.query("SELECT category_id FROM categories WHERE code = ?", [b.category]);
      if (!cat) throw bad("Unknown category"); f.category_id = cat.category_id;
    }
    const diff = {}, before = {};
    for (const [k, v] of Object.entries(f)) {
      const a = old[k] == null ? null : typeof v === "number" ? Number(old[k]) : String(old[k]);
      if (a !== v) { diff[k] = v; before[k] = old[k]; }
    }
    if (Object.keys(diff).length) {
      await conn.query(`UPDATE products SET ${Object.keys(diff).map(k => `${k} = ?`).join(", ")} WHERE product_id = ?`, [...Object.values(diff), id]);
      await auth.audit(conn, req.admin.admin_id, "product", old.sku, "PRODUCT_UPDATE", before, diff);
    }
    let price = { changed: false, scheduled: false };
    if (("price" in b && !blank(b.price) && Number(b.price) > 0) || ("compare_at_price" in b && Number(old.price) > 0)) {
      price = await setPrice(conn, { productId: id, price: "price" in b ? b.price : old.price,
        compareAt: "compare_at_price" in b ? b.compare_at_price : old.compare_at_price,
        effectiveFrom: b.price_effective_from || null, adminId: req.admin.admin_id, source: "ADMIN", note: String(b.price_note || "").slice(0, 255) || null });
    }
    // stock
    if ("track_inventory" in b || "qty_on_hand" in b) {
      const [[inv]] = await conn.query("SELECT * FROM inventory WHERE product_id = ?", [id]);
      const track = "track_inventory" in b ? (b.track_inventory ? 1 : 0) : (inv ? inv.track_inventory : 0);
      const qty = "qty_on_hand" in b && !blank(b.qty_on_hand) ? parseInt(b.qty_on_hand, 10) : (inv ? inv.qty_on_hand : 0);
      if (isNaN(qty)) throw bad("Stock must be a whole number");
      if (!inv) await conn.query("INSERT INTO inventory (product_id, qty_on_hand, track_inventory) VALUES (?,?,?)", [id, qty, track]);
      else if (inv.qty_on_hand !== qty || inv.track_inventory !== track) {
        await conn.query("UPDATE inventory SET qty_on_hand = ?, track_inventory = ? WHERE product_id = ?", [qty, track, id]);
        if (inv.qty_on_hand !== qty) await conn.query("INSERT INTO inventory_transactions (product_id, txn_type, qty, note, created_by) VALUES (?, 'ADJUSTMENT', ?, ?, ?)",
          [id, qty - inv.qty_on_hand, `Stock set to ${qty} in admin`, req.admin.admin_id]);
        await auth.audit(conn, req.admin.admin_id, "product", old.sku, "STOCK_UPDATE", { qty: inv.qty_on_hand, track: !!inv.track_inventory }, { qty, track: !!track });
      }
    }
    const [[now]] = await conn.query("SELECT status, price, pack_size_label FROM products WHERE product_id = ?", [id]);
    if (["ACTIVE", "COMING_SOON", "OUT_OF_STOCK"].includes(now.status) && (!(Number(now.price) > 0) || blank(now.pack_size_label)))
      throw bad("Set a price and pack size before making the product Active or Coming soon (or keep it as Draft).");
    return price;
  });
  res.json({ ...(await productDetail(id)), price_result: result });
}));

router.delete("/products/:id/scheduled-price/:pid", wrap(async (req, res) => {
  const [[h]] = await pool.query("SELECT h.*, p.sku FROM product_price_history h JOIN products p USING (product_id) WHERE h.price_id = ? AND h.product_id = ? AND h.is_applied = 0",
    [req.params.pid, req.params.id]);
  if (!h) throw bad("Scheduled price not found", 404);
  await pool.query("DELETE FROM product_price_history WHERE price_id = ?", [h.price_id]);
  await auth.audit(null, req.admin.admin_id, "product", h.sku, "PRICE_SCHEDULE_CANCELLED", { price: h.price, effective_from: h.effective_from }, null);
  res.json({ ok: true });
}));

/* ---- photos ---- */
router.post("/products/:id/images", uploadImages.array("photos", 10), wrap(async (req, res) => {
  const [[p]] = await pool.query("SELECT product_id, sku FROM products WHERE product_id = ?", [req.params.id]);
  if (!p) throw bad("Product not found", 404);
  if (!req.files?.length) throw bad("Choose at least one photo");
  const saved = req.files.map(f => images.saveUpload(p.sku, f.buffer, f.originalname));
  await images.scan();
  await auth.audit(null, req.admin.admin_id, "product", p.sku, "IMAGE_UPLOAD", null, { files: saved });
  res.json(await productDetail(p.product_id));
}));
router.patch("/products/:id/images/:img/primary", wrap(async (req, res) => {
  const [[im]] = await pool.query("SELECT i.file_name, p.sku FROM product_images i JOIN products p USING (product_id) WHERE i.image_id = ? AND i.product_id = ?", [req.params.img, req.params.id]);
  if (!im) throw bad("Photo not found", 404);
  await images.setPrimary(Number(req.params.id), im.file_name);
  await auth.audit(null, req.admin.admin_id, "product", im.sku, "IMAGE_PRIMARY", null, { file: im.file_name });
  res.json(await productDetail(Number(req.params.id)));
}));
router.delete("/products/:id/images/:img", wrap(async (req, res) => {
  const [[im]] = await pool.query("SELECT i.image_id, i.file_name, p.sku FROM product_images i JOIN products p USING (product_id) WHERE i.image_id = ? AND i.product_id = ?", [req.params.img, req.params.id]);
  if (!im) throw bad("Photo not found", 404);
  images.removeFile(im.file_name);
  await pool.query("DELETE FROM product_images WHERE image_id = ?", [im.image_id]);
  await images.scan();
  await auth.audit(null, req.admin.admin_id, "product", im.sku, "IMAGE_DELETE", { file: im.file_name }, null);
  res.json(await productDetail(Number(req.params.id)));
}));
router.post("/images/scan", wrap(async (req, res) => {
  const r = await images.scan();
  await auth.audit(null, req.admin.admin_id, "images", "folder", "IMAGE_SCAN", null, { matched: r.matched, added: r.added, removed: r.removed, unmatched: r.unmatched.length });
  res.json(r);
}));

/* ---- Excel import ---- */
router.post("/import", uploadXlsx.single("file"), wrap(async (req, res) => {
  if (!req.file) throw bad("Choose the Excel file");
  if (!/\.xlsx$/i.test(req.file.originalname)) throw bad("Please upload the .xlsx template (Excel 2007+ format)");
  res.json(await importer.validate(req.file.buffer, req.file.originalname, req.admin.admin_id));
}));
router.post("/import/:batch/apply", wrap(async (req, res) => res.json(await importer.apply(Number(req.params.batch), req.admin.admin_id))));

/* ================================================================== REPORTS */
router.get("/reports/:name", wrap(async (req, res) => {
  const fn = REPORTS[req.params.name];
  if (!fn) throw bad("Unknown report", 404);
  const rep = await fn(req.query);
  if (req.query.format === "csv") {
    const file = `tanjo_${req.params.name}_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
    return res.send(toCsv(rep));
  }
  res.json(rep);
}));

/* multer / upload errors -> friendly message */
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message });
  next(err);
});

module.exports = router;
