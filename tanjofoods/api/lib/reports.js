/**
 * Admin reports. Every report returns
 *   { title, subtitle, columns:[{key,label,type}], rows:[...], totals:{...} | null }
 * type: text | money | int | date | datetime | status   (used for formatting and CSV)
 *
 * "Sales" = orders that are not cancelled AND (paid, or pay-on-delivery/pickup).
 * Card orders still waiting for payment are not counted as sales.
 */
const { pool } = require("../db");

const SALE = "o.status <> 'CANCELLED' AND (o.payment_status = 'PAID' OR o.payment_method = 'PAY_ON_DELIVERY')";
const STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED", "REFUNDED"];
const r2 = n => Math.round(Number(n || 0) * 100) / 100;
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

function range(q) {
  const today = new Date(); const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const from = isDate(q.from) ? q.from : iso(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = isDate(q.to) ? q.to : iso(today);
  return { from, to, label: `${from} to ${to}` };
}
const sum = (rows, keys) => Object.fromEntries(keys.map(k => [k, r2(rows.reduce((a, r) => a + Number(r[k] || 0), 0))]));

/* 1. Orders – date range + status (one or all) */
async function orders(q) {
  const { from, to, label } = range(q);
  const basis = q.basis === "scheduled" ? "o.scheduled_date" : "DATE(o.created_at)";
  const where = [`${basis} BETWEEN ? AND ?`], args = [from, to];
  if (q.status && q.status !== "ALL" && STATUSES.includes(q.status)) { where.push("o.status = ?"); args.push(q.status); }
  if (q.payment && q.payment !== "ALL") { where.push("o.payment_status = ?"); args.push(q.payment); }
  if (q.fulfilment && q.fulfilment !== "ALL") { where.push("o.fulfilment_type = ?"); args.push(q.fulfilment); }
  const [rows] = await pool.query(
    `SELECT o.order_no, o.created_at, o.scheduled_date, o.time_slot, o.cust_name, o.cust_phone, o.cust_email, o.fulfilment_type,
            (SELECT SUM(qty) FROM order_items oi WHERE oi.order_id = o.order_id) AS items,
            (SELECT GROUP_CONCAT(CONCAT(oi.qty, ' x ', oi.product_name) ORDER BY oi.order_item_id SEPARATOR '; ') FROM order_items oi WHERE oi.order_id = o.order_id) AS products,
            o.subtotal, o.delivery_fee, o.gst_amount, o.qst_amount, o.grand_total, o.payment_method, o.payment_status, o.status,
            (SELECT a.full_name FROM order_status_history h LEFT JOIN admin_users a ON a.admin_id = h.changed_by
              WHERE h.order_id = o.order_id ORDER BY h.history_id DESC LIMIT 1) AS last_updated_by
       FROM orders o WHERE ${where.join(" AND ")} ORDER BY o.created_at`, args);
  rows.forEach(r => { r.last_updated_by = r.last_updated_by || "System / customer"; });
  return {
    title: "Orders", subtitle: `${q.basis === "scheduled" ? "Delivery/pickup date" : "Order date"} ${label} · Status: ${q.status && q.status !== "ALL" ? q.status : "All"}`,
    columns: [
      { key: "order_no", label: "Order", type: "text" }, { key: "created_at", label: "Placed", type: "datetime" },
      { key: "scheduled_date", label: "For date", type: "date" }, { key: "time_slot", label: "Slot", type: "text" },
      { key: "cust_name", label: "Customer", type: "text" }, { key: "cust_phone", label: "Phone", type: "text" },
      { key: "cust_email", label: "E-mail", type: "text" }, { key: "fulfilment_type", label: "Type", type: "status" },
      { key: "items", label: "Items", type: "int" }, { key: "products", label: "Products", type: "text" },
      { key: "subtotal", label: "Subtotal", type: "money" }, { key: "delivery_fee", label: "Delivery", type: "money" },
      { key: "gst_amount", label: "GST", type: "money" }, { key: "qst_amount", label: "QST", type: "money" },
      { key: "grand_total", label: "Total", type: "money" }, { key: "payment_method", label: "Pay method", type: "status" },
      { key: "payment_status", label: "Payment", type: "status" }, { key: "status", label: "Status", type: "status" },
      { key: "last_updated_by", label: "Last updated by", type: "text" }],
    rows, totals: { order_no: `${rows.length} orders`, ...sum(rows, ["items", "subtotal", "delivery_fee", "gst_amount", "qst_amount", "grand_total"]) },
  };
}

/* 2. Sales / revenue summary by day, week or month – includes GST & QST collected (for tax filing) */
async function sales(q) {
  const { from, to, label } = range(q);
  const fmt = { day: "%Y-%m-%d", week: "%x-W%v", month: "%Y-%m" }[q.group] || "%Y-%m-%d";
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(o.created_at, ?) AS period, COUNT(*) AS orders,
            SUM(o.subtotal) AS subtotal, SUM(o.discount_total) AS discounts, SUM(o.delivery_fee) AS delivery,
            SUM(o.gst_amount) AS gst, SUM(o.qst_amount) AS qst, SUM(o.grand_total) AS total,
            SUM(o.fulfilment_type = 'DELIVERY') AS deliveries, SUM(o.fulfilment_type = 'PICKUP') AS pickups,
            SUM(CASE WHEN o.payment_method = 'CARD' THEN o.grand_total ELSE 0 END) AS card_total,
            SUM(CASE WHEN o.payment_method = 'PAY_ON_DELIVERY' THEN o.grand_total ELSE 0 END) AS pay_on_delivery_total
       FROM orders o WHERE DATE(o.created_at) BETWEEN ? AND ? AND ${SALE}
      GROUP BY period ORDER BY period`, [fmt, from, to]);
  rows.forEach(r => { r.avg_order = r.orders ? r2(r.total / r.orders) : 0; r.net_sales = r2(r.subtotal - r.discounts); });
  const t = sum(rows, ["orders", "subtotal", "discounts", "net_sales", "delivery", "gst", "qst", "total", "deliveries", "pickups", "card_total", "pay_on_delivery_total"]);
  t.avg_order = t.orders ? r2(t.total / t.orders) : 0; t.period = "Total";
  const [[cancel]] = await pool.query("SELECT COUNT(*) n, COALESCE(SUM(grand_total),0) v FROM orders WHERE DATE(created_at) BETWEEN ? AND ? AND status = 'CANCELLED'", [from, to]);
  const [[unpaid]] = await pool.query("SELECT COUNT(*) n, COALESCE(SUM(grand_total),0) v FROM orders WHERE DATE(created_at) BETWEEN ? AND ? AND status <> 'CANCELLED' AND payment_method = 'CARD' AND payment_status <> 'PAID'", [from, to]);
  return {
    title: "Sales & tax summary", subtitle: `${label} · by ${q.group || "day"} · excludes cancelled orders (${cancel.n}, $${r2(cancel.v)}) and unpaid card orders (${unpaid.n}, $${r2(unpaid.v)})`,
    columns: [
      { key: "period", label: q.group === "month" ? "Month" : q.group === "week" ? "Week" : "Day", type: "text" },
      { key: "orders", label: "Orders", type: "int" }, { key: "subtotal", label: "Product sales", type: "money" },
      { key: "discounts", label: "Discounts", type: "money" }, { key: "net_sales", label: "Net sales", type: "money" },
      { key: "delivery", label: "Delivery fees", type: "money" }, { key: "gst", label: "GST collected", type: "money" },
      { key: "qst", label: "QST collected", type: "money" }, { key: "total", label: "Total received", type: "money" },
      { key: "avg_order", label: "Avg order", type: "money" }, { key: "deliveries", label: "Deliveries", type: "int" },
      { key: "pickups", label: "Pickups", type: "int" }, { key: "card_total", label: "Card", type: "money" },
      { key: "pay_on_delivery_total", label: "Pay on delivery/pickup", type: "money" }],
    rows, totals: t,
  };
}

/* 3. Product & category sales */
async function products(q) {
  const { from, to, label } = range(q);
  const [rows] = await pool.query(
    `SELECT oi.sku, MAX(oi.product_name) AS product, c.name_en AS category, SUM(oi.qty) AS qty, COUNT(DISTINCT o.order_id) AS orders,
            SUM(oi.line_total) AS revenue, ROUND(SUM(oi.line_total) / SUM(oi.qty), 2) AS avg_price,
            MIN(oi.unit_price) AS min_price, MAX(oi.unit_price) AS max_price, MAX(p.price) AS current_price
       FROM order_items oi JOIN orders o ON o.order_id = oi.order_id
       JOIN products p ON p.product_id = oi.product_id JOIN categories c ON c.category_id = p.category_id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND ${SALE}
      GROUP BY oi.sku, c.name_en ORDER BY revenue DESC`, [from, to]);
  const total = rows.reduce((a, r) => a + Number(r.revenue), 0);
  rows.forEach(r => { r.share = total ? r2((r.revenue / total) * 100) : 0; });
  return {
    title: "Product sales", subtitle: `${label} · best sellers first`,
    columns: [
      { key: "sku", label: "SKU", type: "text" }, { key: "product", label: "Product", type: "text" }, { key: "category", label: "Category", type: "text" },
      { key: "qty", label: "Units sold", type: "int" }, { key: "orders", label: "Orders", type: "int" }, { key: "revenue", label: "Revenue", type: "money" },
      { key: "share", label: "% of sales", type: "pct" }, { key: "avg_price", label: "Avg price", type: "money" },
      { key: "min_price", label: "Lowest price", type: "money" }, { key: "max_price", label: "Highest price", type: "money" },
      { key: "current_price", label: "Current price", type: "money" }],
    rows, totals: { sku: "Total", ...sum(rows, ["qty", "revenue"]), share: rows.length ? 100 : 0 },
  };
}

/* 4. Customers – who buys most / most often (basis for a future loyalty/points programme) */
async function customers(q) {
  const all = q.period === "all";
  const { from, to, label } = range(q);
  const minOrders = Math.max(1, parseInt(q.min_orders, 10) || 1);
  const [rows] = await pool.query(
    `SELECT o.cust_email AS email, MAX(o.cust_name) AS name, MAX(o.cust_phone) AS phone,
            COUNT(*) AS orders, SUM(o.grand_total) AS spent, ROUND(AVG(o.grand_total), 2) AS avg_order,
            MIN(DATE(o.created_at)) AS first_order, MAX(DATE(o.created_at)) AS last_order,
            DATEDIFF(CURDATE(), MAX(o.created_at)) AS days_since_last,
            SUM(o.fulfilment_type = 'DELIVERY') AS deliveries, MAX(cu.marketing_opt_in) AS opted_in
       FROM orders o LEFT JOIN customers cu ON cu.customer_id = o.customer_id
      WHERE ${SALE} ${all ? "" : "AND DATE(o.created_at) BETWEEN ? AND ?"}
      GROUP BY o.cust_email HAVING COUNT(*) >= ? ORDER BY spent DESC`, all ? [minOrders] : [from, to, minOrders]);
  rows.forEach(r => {
    const spanDays = Math.max(1, (new Date(r.last_order) - new Date(r.first_order)) / 86400000);
    r.orders_per_month = r.orders > 1 && spanDays >= 30 ? r2(r.orders / (spanDays / 30)) : null;   // needs a month of history
    r.segment = r.orders >= 6 ? "Loyal" : r.orders >= 3 ? "Regular" : r.orders === 2 ? "Returning" : "New";
    if (r.days_since_last > 60 && r.orders >= 2) r.segment += " – lapsing";
    r.points = Math.floor(r.spent);                     // illustrative: 1 point per $1 spent
    r.opted_in = r.opted_in ? "Yes" : "No";
  });
  return {
    title: "Customers", subtitle: `${all ? "All time" : label} · at least ${minOrders} order(s) · ranked by spend · Points = 1 per $1 (illustration for a future loyalty programme)`,
    columns: [
      { key: "name", label: "Customer", type: "text" }, { key: "email", label: "E-mail", type: "text" }, { key: "phone", label: "Phone", type: "text" },
      { key: "segment", label: "Segment", type: "text" }, { key: "orders", label: "Orders", type: "int" }, { key: "spent", label: "Total spent", type: "money" },
      { key: "avg_order", label: "Avg order", type: "money" }, { key: "orders_per_month", label: "Orders / month", type: "text" },
      { key: "first_order", label: "First order", type: "date" }, { key: "last_order", label: "Last order", type: "date" },
      { key: "days_since_last", label: "Days since last", type: "int" }, { key: "deliveries", label: "Deliveries", type: "int" },
      { key: "points", label: "Points", type: "int" }, { key: "opted_in", label: "Marketing opt-in", type: "text" }],
    rows, totals: { name: `${rows.length} customers`, ...sum(rows, ["orders", "spent", "points"]) },
  };
}

/* 5. Price history – every price period with cut-off dates */
async function prices(q) {
  const { from, to, label } = range(q);
  const args = [to + " 23:59:59", from + " 00:00:00"];
  let extra = "";
  if (q.sku) { extra = "AND p.sku = ?"; args.push(q.sku); }
  const [rows] = await pool.query(
    `SELECT p.sku, p.name_en AS product, h.price, h.compare_at_price, h.effective_from, h.effective_to,
            CASE WHEN h.is_applied = 0 THEN 'SCHEDULED' WHEN h.effective_to IS NULL THEN 'CURRENT' ELSE 'PAST' END AS state,
            h.source, h.note, COALESCE(a.full_name, CASE h.source WHEN 'INITIAL' THEN 'Setup' ELSE 'System' END) AS changed_by, h.created_at
       FROM product_price_history h JOIN products p ON p.product_id = h.product_id LEFT JOIN admin_users a ON a.admin_id = h.changed_by
      WHERE h.effective_from <= ? AND (h.effective_to IS NULL OR h.effective_to >= ?) ${extra}
      ORDER BY p.sku, h.effective_from, h.price_id`, args);
  return {
    title: "Price history", subtitle: `Prices in effect between ${label}${q.sku ? " · " + q.sku : ""} (scheduled future prices included)`,
    columns: [
      { key: "sku", label: "SKU", type: "text" }, { key: "product", label: "Product", type: "text" },
      { key: "price", label: "Price", type: "money" }, { key: "compare_at_price", label: "Was price", type: "money" },
      { key: "effective_from", label: "Effective from", type: "datetime" }, { key: "effective_to", label: "Effective to (cut-off)", type: "datetime" },
      { key: "state", label: "State", type: "status" }, { key: "source", label: "Source", type: "text" },
      { key: "changed_by", label: "Changed by", type: "text" }, { key: "note", label: "Note", type: "text" }],
    rows, totals: null,
  };
}

/* 6. Activity – who did what (logins, status changes, product & price edits, users) */
async function activity(q) {
  const { from, to, label } = range(q);
  const args = [from, to]; let extra = "";
  if (q.admin_id) { extra = "AND l.admin_id = ?"; args.push(q.admin_id); }
  const [rows] = await pool.query(
    `SELECT l.created_at, COALESCE(a.full_name, 'System') AS user, l.action, l.entity, l.entity_id, l.old_values, l.new_values
       FROM audit_log l LEFT JOIN admin_users a ON a.admin_id = l.admin_id
      WHERE DATE(l.created_at) BETWEEN ? AND ? ${extra} ORDER BY l.audit_id DESC LIMIT 5000`, args);
  const brief = v => { if (v == null) return ""; const o = typeof v === "string" ? JSON.parse(v) : v; return Object.entries(o).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", "); };
  rows.forEach(r => { r.details = [brief(r.old_values) && "from " + brief(r.old_values), brief(r.new_values) && "to " + brief(r.new_values)].filter(Boolean).join(" → "); delete r.old_values; delete r.new_values; });
  return {
    title: "Activity log", subtitle: `${label} · newest first`,
    columns: [
      { key: "created_at", label: "When", type: "datetime" }, { key: "user", label: "User", type: "text" }, { key: "action", label: "Action", type: "status" },
      { key: "entity", label: "Record", type: "text" }, { key: "entity_id", label: "ID", type: "text" }, { key: "details", label: "Details", type: "text" }],
    rows, totals: null,
  };
}

const REPORTS = { orders, sales, products, customers, prices, activity };

function toCsv(rep) {
  const cell = v => { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [[rep.title], [rep.subtitle], [], rep.columns.map(c => c.label)];
  for (const r of rep.rows) lines.push(rep.columns.map(c => r[c.key]));
  if (rep.totals) lines.push(rep.columns.map(c => rep.totals[c.key] ?? ""));
  return "﻿" + lines.map(l => l.map(cell).join(",")).join("\r\n");
}

module.exports = { REPORTS, toCsv };
