// E-mail: real SMTP when SMTP_HOST is set, otherwise written to api/outbox/*.html for testing
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const cfg = require("../config");

const OUTBOX = path.join(__dirname, "..", "outbox");
let transport;
function getTransport() {
  if (transport !== undefined) return transport;
  const s = cfg.smtp();
  transport = s.host ? nodemailer.createTransport({ host: s.host, port: s.port, secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined }) : null;
  return transport;
}

async function send({ to, subject, html }) {
  if (!to) return;
  const from = cfg.smtp().from;
  const transport = getTransport();
  if (transport) {
    try { await transport.sendMail({ from, to, subject, html }); console.log(`[mail] sent "${subject}" to ${to}`); }
    catch (e) { console.error(`[mail] FAILED "${subject}" to ${to}: ${e.message}`); }
    return;
  }
  fs.mkdirSync(OUTBOX, { recursive: true });
  const file = path.join(OUTBOX, `${new Date().toISOString().replace(/[:.]/g, "-")}_${subject.replace(/[^a-z0-9]+/gi, "_").slice(0, 50)}.html`);
  fs.writeFileSync(file, `<!-- From: ${from}\n     To: ${to}\n     Subject: ${subject} -->\n${html}`);
  console.log(`[mail] (no SMTP) "${subject}" to ${to} -> outbox/${path.basename(file)}`);
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = n => "$" + Number(n || 0).toFixed(2);

const L = {
  en: { delivery: "Delivery", pickup: "Pickup", on: "on", sub: "Subtotal", del: "Delivery", total: "Total", pay: "Payment",
        PAID: "paid", UNPAID: "unpaid", FAILED: "failed", CARD: "card", PAY_ON_DELIVERY: "pay on delivery / pickup" },
  fr: { delivery: "Livraison", pickup: "Cueillette", on: "le", sub: "Sous-total", del: "Livraison", total: "Total", pay: "Paiement",
        PAID: "payé", UNPAID: "non payé", FAILED: "refusé", CARD: "carte", PAY_ON_DELIVERY: "paiement à la livraison / cueillette" },
};
const moneyFr = n => Number(n || 0).toFixed(2).replace(".", ",") + " $";

/** Order summary e-mail. lang 'fr' uses French labels, French product names and Quebec money format. */
function orderEmailHtml(o, items, heading, intro, lang = "en") {
  const t = L[lang] || L.en, m = lang === "fr" ? moneyFr : money;
  const rows = items.map(i => `<tr><td style="padding:6px 0">${i.qty} × ${esc((lang === "fr" && i.product_name_fr) || i.product_name)} <span style="color:#888">(${esc(i.pack_size_label || "")})</span></td><td align="right">${m(i.line_total)}</td></tr>`).join("");
  const addr = o.fulfilment_type === "DELIVERY"
    ? `${esc(o.ship_line1)}${o.ship_line2 ? ", " + esc(o.ship_line2) : ""}, ${esc(o.ship_city)} ${esc(o.ship_province)} ${esc(o.ship_postal_code)}`
    : t.pickup;
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f1a17">
  <h2 style="color:#123d2b;margin-bottom:4px">${esc(heading)}</h2>
  <p>${intro}</p>
  <p style="background:#fbf7f0;border:1px dashed #123d2b;padding:10px;border-radius:8px"><b>${lang === "fr" ? "Commande" : "Order"} ${esc(o.order_no)}</b><br>
  ${o.fulfilment_type === "DELIVERY" ? t.delivery : t.pickup} ${t.on} <b>${esc(o.scheduled_date)}</b> ${esc(o.time_slot || "")}<br>${addr}</p>
  <table width="100%" style="border-collapse:collapse;font-size:14px">${rows}
  <tr><td style="border-top:1px solid #ddd;padding-top:8px">${t.sub}</td><td align="right" style="border-top:1px solid #ddd;padding-top:8px">${m(o.subtotal)}</td></tr>
  <tr><td>${t.del}</td><td align="right">${m(o.delivery_fee)}</td></tr>
  <tr><td>TPS / GST</td><td align="right">${m(o.gst_amount)}</td></tr>
  <tr><td>TVQ / QST</td><td align="right">${m(o.qst_amount)}</td></tr>
  <tr><td><b>${t.total}</b></td><td align="right"><b>${m(o.grand_total)}</b></td></tr></table>
  <p style="font-size:13px;color:#666">${t.pay}: ${esc(t[o.payment_method] || o.payment_method)} · ${esc(t[o.payment_status] || o.payment_status)}</p>
  <p style="font-size:13px;color:#666">Tanjo Foods · 8451 Chem. Dalton, Mont-Royal, QC H4T 1V5</p></div>`;
}

module.exports = { send, orderEmailHtml, esc, money };
