/* ==========================================================
   Tanjo Foods – storefront logic (vanilla JS, no build step)
   - Bilingual: English / French (toggle in the header, remembered; ?lang=fr forces French)
   - Hash routing: #/ #/about #/products #/contact  -> landing page
                   #/shop  #/shop/<CATEGORY_CODE>     -> order online
                   #/order/<no>?t=<token>             -> order confirmation (after payment)
   - Works at any address (/, /v1/tanjo/ …): all links and API calls are relative.
   - When served by the Tanjo Foods API, products, settings, orders and enquiries go
     through api/…; opened as a plain file it runs in demo mode.
   ========================================================== */
(function () {
  "use strict";

  const S = window.TANJO_SETTINGS || {};
  const I18N = window.TANJO_I18N || { page: {}, ui: { en: {}, fr: {} } };
  let CATS = window.TANJO_CATEGORIES || [];
  let PRODUCTS = window.TANJO_PRODUCTS || [];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bySku = sku => PRODUCTS.find(p => p.sku === sku);

  /* ---------- storage (safe) ---------- */
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return k in mem ? mem[k] : d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; } }
  };

  /* ---------- language ---------- */
  const urlLang = new URLSearchParams(location.search).get("lang");
  let lang = ["en", "fr"].includes(urlLang) ? urlLang : store.get("tanjo_lang", null) || ((navigator.language || "").toLowerCase().startsWith("fr") ? "fr" : "en");
  const t = (key, vars) => {
    let s = (I18N.ui[lang] && I18N.ui[lang][key]) ?? I18N.ui.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split("{" + k + "}").join(v);
    return s;
  };
  const money = n => new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: S.currency || "CAD" }).format(n || 0);
  const pn = p => (lang === "fr" && p.nameFr) || p.name;                              // product display name
  const pAlt = p => [p.regional, lang === "fr" ? p.name : p.nameFr].filter(Boolean).filter(x => x !== pn(p)).join(" · ");
  const pDesc = p => (lang === "fr" && p.descFr) || p.desc || "";
  const cName = c => (lang === "fr" && c.nameFr) || c.name;
  const cBlurb = c => (lang === "fr" && c.blurbFr) || c.blurb || "";
  const tagName = x => (lang === "fr" && I18N.ui.fr.tags && I18N.ui.fr.tags[x]) || x;
  const prepName = x => (I18N.ui[lang].prep && I18N.ui[lang].prep[x]) || x || "";
  const taxName = tx => { const pct = (tx.rate * 100).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { maximumFractionDigits: 3 });
    return `${t(String(tx.code).toLowerCase()) || tx.code} (${pct}${lang === "fr" ? " %" : "%"})`; };

  function applyPageLang() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach(el => {
      if (el.dataset.en == null) el.dataset.en = el.innerHTML;
      const fr = I18N.page[el.dataset.i18n];
      el.innerHTML = lang === "fr" && fr ? fr : el.dataset.en;
    });
    $$("[data-i18n-ph]").forEach(el => {
      if (el.dataset.enPh == null) el.dataset.enPh = el.placeholder;
      const fr = I18N.page[el.dataset.i18nPh];
      el.placeholder = lang === "fr" && fr ? fr : el.dataset.enPh;
    });
    $$("[data-lang]").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
    document.title = lang === "fr" ? "Tanjo Foods – De la nourriture pour chaque moment" : "Tanjo Foods – Food for Every Moment";
  }
  function setLang(l) {
    lang = l; store.set("tanjo_lang", l);
    applyPageLang(); updateRibbon(); updateStatic();
    if ($("#modal").classList.contains("on")) closeModal();
    if ($("#view-shop").classList.contains("on")) { renderChips(); renderCatalogue(); }
    renderCart();
  }

  /* ---------- state ---------- */
  let cart = store.get("tanjo_cart", {});          // { sku: qty }
  let fulfil = store.get("tanjo_fulfil", "delivery");
  let activeCat = "ALL", query = "", sortBy = "featured";

  /* ---------- toast ---------- */
  let tt;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("on"); clearTimeout(tt); tt = setTimeout(() => el.classList.remove("on"), 1800); }

  /* ==========================================================
     CART
     ========================================================== */
  function setQty(sku, qty) {
    const p = bySku(sku); if (!p || p.status !== "active") return;
    const max = p.maxQty || 20;
    qty = Math.max(0, Math.min(max, qty));
    if (qty === 0) delete cart[sku]; else cart[sku] = qty;
    store.set("tanjo_cart", cart);
    renderCart(); updateCardControls(sku);
  }
  const qtyOf = sku => cart[sku] || 0;

  function totals() {
    let sub = 0, taxable = 0, count = 0;
    for (const [sku, q] of Object.entries(cart)) {
      const p = bySku(sku); if (!p) continue;
      const line = p.price * q; sub += line; count += q;
      if (p.taxable !== false) taxable += line;
    }
    const delivery = fulfil === "delivery" && sub > 0 ? (sub >= (S.freeDeliveryOver || Infinity) ? 0 : (S.deliveryFee || 0)) : 0;
    // Delivery fee follows the tax status of the goods (same rule as the server)
    const taxBase = taxable + (taxable > 0 ? delivery : 0);
    const taxes = (S.taxes || []).map(x => ({ ...x, amount: Math.round(taxBase * x.rate * 100) / 100 }));
    const tax = taxes.reduce((a, x) => a + x.amount, 0);
    return { sub, delivery, taxes, tax, total: sub + delivery + tax, count, minOk: sub >= (S.minOrder || 0) };
  }

  function renderCart() {
    const T = totals();
    const c = $("#cartCount"); c.textContent = T.count || ""; c.dataset.n = T.count;
    const items = $("#cartItems"), foot = $("#cartFoot");
    const keys = Object.keys(cart).filter(bySku);
    const fl = fulfil === "delivery" ? t("delivery") : t("pickup");
    if (!keys.length) {
      items.innerHTML = `<div class="cart-empty"><div class="em">🛍️</div><p><b>${t("cart_empty_t")}</b><br>${t("cart_empty_s")}</p></div>`;
      foot.innerHTML = `<div class="row"><span>${fl}</span><span>${fulfil === "delivery" ? t("from") + " " + money(S.deliveryFee) : t("free")}</span></div>`;
    } else {
      items.innerHTML = keys.map(sku => {
        const p = bySku(sku), q = cart[sku];
        const img = p.image ? `<img src="${esc(p.image)}" alt="">` : `<div class="noimg">🥟</div>`;
        return `<div class="ci">${img}<div><div class="n">${esc(pn(p))}</div><div class="s">${esc(p.size)} · ${money(p.price)}</div>
          <div class="q"><button data-dec="${sku}" aria-label="−">−</button><span>${q}</span><button data-inc="${sku}" aria-label="+">+</button></div></div>
          <div class="lt">${money(p.price * q)}</div></div>`;
      }).join("");
      const freeLeft = (S.freeDeliveryOver || 0) - T.sub;
      const pct = Math.min(100, (T.sub / (S.freeDeliveryOver || 1)) * 100);
      foot.innerHTML = `
        ${fulfil === "delivery" && freeLeft > 0 ? `<div style="font-size:12.5px;color:var(--muted)">${t("free_more", { amt: money(freeLeft) })}</div><div class="progress"><i style="width:${pct}%"></i></div>` : ""}
        <div class="row"><span>${t("subtotal")}</span><span>${money(T.sub)}</span></div>
        <div class="row"><span>${fl}</span><span>${T.delivery ? money(T.delivery) : t("free")}</span></div>
        ${T.taxes.map(x => `<div class="row"><span>${esc(taxName(x))}</span><span>${money(x.amount)}</span></div>`).join("")}
        <div class="row total"><span>${t("total")}</span><span>${money(T.total)}</span></div>
        ${!T.minOk ? `<div class="min-note">${t("min_note", { min: money(S.minOrder), more: money(S.minOrder - T.sub) })}</div>` : ""}
        <button class="btn btn-primary" id="checkoutBtn" ${T.minOk ? "" : "disabled"}>${t("checkout")} · ${money(T.total)}</button>`;
    }
    const mob = $("#mobCart");
    mob.classList.toggle("hide", !T.count || !$("#view-shop").classList.contains("on"));
    $("#mobCartN").textContent = t("view_cart", { n: T.count }); $("#mobCartT").textContent = money(T.total);
  }

  /* ==========================================================
     CATALOGUE
     ========================================================== */
  function controlHTML(p) {
    if (p.status === "coming_soon") return `<button class="notify" data-notify="${p.sku}">${t("notify_me")}</button>`;
    if (p.status === "sold_out") return `<span class="notify" style="opacity:.6">${t("sold_out")}</span>`;
    const q = qtyOf(p.sku);
    if (!q) return `<button class="add" data-inc="${p.sku}" aria-label="${esc(pn(p))} +">+</button>`;
    return `<div class="stepper"><button data-dec="${p.sku}" aria-label="−">${q === 1 ? "🗑" : "−"}</button><span>${q}</span><button data-inc="${p.sku}" aria-label="+">+</button></div>`;
  }
  function updateCardControls(sku) {
    $$(`[data-ctl="${sku}"]`).forEach(el => el.innerHTML = controlHTML(bySku(sku)));
    const pd = $(`[data-pdctl="${sku}"]`); if (pd) pd.innerHTML = pdBuy(bySku(sku));
  }
  const tagsHTML = p => (p.tags || []).map(x => `<span class="${x === "Spicy" ? "hot" : ""}">${esc(tagName(x))}</span>`).join("");
  const noImg = (h = "") => `<div class="p-noimg" ${h}><div><span class="em">🥟</span>${t("photo_soon")}</div></div>`;

  function card(p) {
    return `<article class="p-card">
      ${p.status === "coming_soon" ? `<span class="soon">${t("coming_soon")}</span>` : p.status === "sold_out" ? `<span class="soon" style="background:#ddd">${t("sold_out")}</span>` : p.featured ? `<span class="feat">${t("popular")}</span>` : ""}
      <div class="p-img" data-open="${p.sku}">${p.image ? `<img src="${esc(p.image)}" alt="${esc(pn(p))}" loading="lazy">` : noImg()}</div>
      <div class="p-body">
        <div class="p-name">${esc(pn(p))}</div>
        <div class="p-alt">${esc(pAlt(p))}</div>
        <div class="p-tags">${tagsHTML(p)}</div>
        <div class="p-foot"><div class="p-price">${money(p.price)}<small>${esc(p.size)}</small></div><div data-ctl="${p.sku}">${controlHTML(p)}</div></div>
      </div></article>`;
  }

  function renderChips() {
    $("#chips").innerHTML = [{ code: "ALL", name: t("all"), nameFr: t("all") }, ...CATS].map(c =>
      `<button class="chip ${activeCat === c.code ? "on" : ""}" data-cat="${c.code}">${esc(cName(c))}</button>`).join("");
  }

  function renderCatalogue() {
    const ql = query.trim().toLowerCase();
    const match = p => !ql || [p.name, p.nameFr, p.regional, p.desc, p.descFr, ...(p.tags || []).map(tagName)].join(" ").toLowerCase().includes(ql);
    const sorter = {
      featured: (a, b) => (b.featured - a.featured) || ((a.status === "coming_soon") - (b.status === "coming_soon")),
      "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price,
      name: (a, b) => pn(a).localeCompare(pn(b), lang)
    }[sortBy];
    const cats = activeCat === "ALL" ? CATS : CATS.filter(c => c.code === activeCat);
    let html = "";
    for (const c of cats) {
      const list = PRODUCTS.filter(p => p.category === c.code && p.status !== "hidden" && match(p)).sort(sorter);
      if (!list.length) continue;
      html += `<div class="cat-block" id="cat-${c.code}"><h2>${esc(cName(c))}</h2><p>${esc(cBlurb(c))}</p><div class="p-grid">${list.map(card).join("")}</div></div>`;
    }
    $("#catalogue").innerHTML = html || `<div class="empty-res">${t("no_match", { q: esc(query) })}</div>`;
  }

  /* ---------- product detail ---------- */
  function pdBuy(p) {
    if (p.status === "coming_soon") return `<button class="btn btn-ghost" data-notify="${p.sku}">${t("notify_long")}</button>`;
    if (p.status === "sold_out") return `<span class="btn btn-ghost" style="opacity:.6">${t("sold_out")}</span>`;
    const q = qtyOf(p.sku);
    return `<div class="qty-lg"><button data-dec="${p.sku}">−</button><span>${q}</span><button data-inc="${p.sku}">+</button></div>
            <button class="btn btn-primary" data-inc="${p.sku}" style="flex:1">${q ? t("add_another") : t("add_cart")} · ${money(p.price)}</button>`;
  }
  function openProduct(sku) {
    const p = bySku(sku); if (!p) return;
    const cat = CATS.find(c => c.code === p.category);
    $("#sheet").innerHTML = `<button class="close" data-close>×</button><div class="pd">
      <div class="im">${p.image ? `<img src="${esc(p.image)}" alt="${esc(pn(p))}">` : noImg('style="height:380px"')}</div>
      <div class="tx"><span class="eyebrow dark">${esc(cat ? cName(cat) : "")}</span>
        <h3>${esc(pn(p))}</h3><div class="p-alt" style="font-size:14px">${esc(pAlt(p))}</div>
        <p style="font-size:16px;color:#3e3732">${esc(pDesc(p))}</p>
        <div class="p-tags">${tagsHTML(p)}</div>
        <dl class="meta"><dt>${t("pack")}</dt><dd>${esc(p.size)}</dd><dt>${t("type")}</dt><dd>${esc(prepName(p.prep))}</dd><dt>${t("price")}</dt><dd>${money(p.price)}</dd><dt>${t("sku")}</dt><dd>${esc(p.sku)}</dd></dl>
        <div class="buy" data-pdctl="${p.sku}">${pdBuy(p)}</div>
      </div></div>`;
    openModal();
  }

  /* ---------- checkout ---------- */
  function minDate() {
    const d = new Date(); d.setDate(d.getDate() + (S.leadDays ?? 1));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const slotOptions = () => (S.slots && S.slots.length ? S.slots : ["10:00 – 13:00", "13:00 – 16:00", "16:00 – 19:00"]).map(s => `<option>${esc(s)}</option>`).join("");
  const req = `<span class="req">*</span>`;
  function openCheckout() {
    const T = totals(); if (!T.count || !T.minOk) return;
    $("#sheet").innerHTML = `<button class="close" data-close>×</button><div class="co">
      <h3>${t("co_title")}</h3><p class="sub">${t("co_sub")}</p>
      <form id="coForm" novalidate><div class="co-grid"><div>
        <h4>${t("co_how")}</h4>
        <div class="seg">
          <label class="opt"><input type="radio" name="fulfilment" value="delivery" ${fulfil === "delivery" ? "checked" : ""}><span><b>${t("delivery")}</b><small>${t("co_delivery_s", { fee: money(S.deliveryFee), free: money(S.freeDeliveryOver) })}</small></span></label>
          <label class="opt"><input type="radio" name="fulfilment" value="pickup" ${fulfil === "pickup" ? "checked" : ""}><span><b>${t("pickup")}</b><small>${esc(S.pickupAddress || "")}</small></span></label>
        </div>
        <h4>${t("co_details")}</h4>
        <div class="grid2">
          <div class="field"><label>${t("co_name")} ${req}</label><input name="name" required autocomplete="name"><span class="msg">${t("required")}</span></div>
          <div class="field"><label>${t("co_phone")} ${req}</label><input name="phone" type="tel" required autocomplete="tel"><span class="msg">${t("required")}</span></div>
        </div>
        <div class="field"><label>${t("co_email")} ${req}</label><input name="email" type="email" required autocomplete="email"><span class="msg">${t("email_err")}</span></div>
        <div id="addrBlock" ${fulfil === "pickup" ? "hidden" : ""}>
          <div class="field"><label>${t("co_addr")} ${req}</label><input name="address1" autocomplete="address-line1"><span class="msg">${t("req_delivery")}</span></div>
          <div class="grid2">
            <div class="field"><label>${t("co_apt")}</label><input name="address2" autocomplete="address-line2"></div>
            <div class="field"><label>${t("co_postal")} ${req}</label><input name="postal" placeholder="H2X 1Y4" autocomplete="postal-code"><span class="msg">${t("postal_err")}</span></div>
          </div>
        </div>
        <div class="grid2">
          <div class="field"><label>${t("co_date")} ${req}</label><input name="date" type="date" min="${minDate()}" value="${minDate()}" required></div>
          <div class="field"><label>${t("co_slot")}</label><select name="slot">${slotOptions()}</select></div>
        </div>
        <h4>${t("co_pay")}</h4>
        <div class="seg">
          <label class="opt"><input type="radio" name="payment" value="CARD" checked><span><b>${t("co_card")}</b><small>${S.paymentMode === "MOCK" ? t("co_card_test") : t("co_card_s")}</small></span></label>
          <label class="opt"><input type="radio" name="payment" value="PAY_ON_DELIVERY"><span><b id="podLabel">${t("co_pod", { where: fulfil === "pickup" ? t("co_pod_pickup") : t("co_pod_door") })}</b><small>${t("co_pod_s")}</small></span></label>
        </div>
        <div class="field"><label>${t("co_notes")}</label><textarea name="notes" style="min-height:70px" placeholder="${esc(t("co_notes_ph"))}"></textarea></div>
      </div>
      <div class="summary" id="coSummary"></div></div></form></div>`;
    renderSummary();
    openModal();
  }
  function renderSummary() {
    const T = totals();
    const lines = Object.keys(cart).filter(bySku).map(sku => { const p = bySku(sku); return `<div class="li"><span>${cart[sku]} × ${esc(pn(p))}</span><span>${money(p.price * cart[sku])}</span></div>`; }).join("");
    $("#coSummary").innerHTML = `<h4>${t("co_summary")}</h4>${lines}
      <div class="row" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line)"><span>${t("subtotal")}</span><span>${money(T.sub)}</span></div>
      <div class="row"><span>${fulfil === "delivery" ? t("delivery") : t("pickup")}</span><span>${T.delivery ? money(T.delivery) : t("free")}</span></div>
      ${T.taxes.map(x => `<div class="row"><span>${esc(taxName(x))}</span><span>${money(x.amount)}</span></div>`).join("")}
      <div class="row total"><span>${t("total")}</span><span>${money(T.total)}</span></div>
      <button class="btn btn-primary" type="submit" form="coForm" style="width:100%;margin-top:14px;padding:14px">${t("place")} · ${money(T.total)}</button>
      <p style="font-size:12px;color:var(--muted);margin:10px 0 0;text-align:center">${t("co_terms")}</p>`;
  }

  async function placeOrder(form) {
    const fd = Object.fromEntries(new FormData(form));
    let ok = true;
    const need = ["name", "phone", "email", "date"];
    if (fd.fulfilment === "delivery") need.push("address1", "postal");
    $$(".field", form).forEach(f => f.classList.remove("err"));
    for (const n of need) {
      const el = form.elements[n]; let bad = !String(fd[n] || "").trim();
      if (n === "email" && !bad) bad = !/^\S+@\S+\.\S+$/.test(fd.email);
      if (n === "postal" && !bad) bad = !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(fd.postal.trim());
      if (bad) { el.closest(".field").classList.add("err"); ok = false; }
    }
    if (!ok) { toast(t("fix_fields")); return; }
    const T = totals();
    const payload = {
      customer: { name: fd.name, phone: fd.phone, email: fd.email }, lang,
      fulfilment_type: fd.fulfilment, scheduled_date: fd.date, time_slot: fd.slot,
      address: fd.fulfilment === "delivery" ? { line1: fd.address1, line2: fd.address2, postal_code: fd.postal.toUpperCase(), city: "Montreal", province: "QC" } : null,
      payment_method: fd.payment, notes: fd.notes,
      items: Object.entries(cart).map(([sku, qty]) => ({ sku, qty })),
      client_totals: { subtotal: T.sub, delivery_fee: T.delivery, tax: T.tax, total: T.total }
    };
    let orderNo = "TF-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + String(Math.floor(Math.random() * 9000) + 1000);
    let total = T.total;
    if (S.apiBase) {
      const btn = $('button[form="coForm"]'); if (btn) { btn.disabled = true; btn.textContent = t("placing"); }
      try {
        const r = await fetch(S.apiBase + "/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || t("order_fail"));
        orderNo = j.order_no; total = j.grand_total;
        if (j.payment_url) { cart = {}; store.set("tanjo_cart", cart); window.location.href = j.payment_url; return; }
      } catch (e) {
        toast(e.message); console.error(e);
        if (btn) { btn.disabled = false; renderSummary(); }
        return;
      }
    }
    cart = {}; store.set("tanjo_cart", cart); renderCart(); renderCatalogue();
    const where = fd.fulfilment === "delivery" ? t("co_pod_door") : t("co_pod_pickup");
    $("#sheet").innerHTML = `<button class="close" data-close>×</button><div class="done">
      <div class="tick">✓</div><h3>${t("thanks", { name: esc(fd.name.split(" ")[0]) })}</h3>
      <p style="color:var(--muted)">${t("received", { email: esc(fd.email) })}</p>
      <div class="ono">${t("order")} ${esc(orderNo)}</div>
      <p style="color:var(--muted);margin:0">${fd.fulfilment === "delivery" ? t("delivery") : t("pickup")} ${t("on")} <b>${esc(fd.date)}</b>, ${esc(fd.slot)} · ${t("total")} <b>${money(total)}</b>${fd.payment === "PAY_ON_DELIVERY" ? " – " + t("pay_on", { where }) : ""}</p>
      <button class="btn btn-green" data-close style="margin-top:24px">${t("continue")}</button></div>`;
  }

  /* ---------- modal ---------- */
  function openModal() { $("#toast").classList.remove("on"); $("#modal").classList.add("on"); document.body.style.overflow = "hidden"; }
  function closeModal() { $("#modal").classList.remove("on"); document.body.style.overflow = ""; }

  /* ==========================================================
     ROUTING
     ========================================================== */
  async function showOrder(no, token) {
    try {
      const r = await fetch(`${S.apiBase}/orders/${encodeURIComponent(no)}?t=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error();
      const o = await r.json();
      const paid = o.payment_status === "PAID";
      const iname = i => (lang === "fr" && i.product_name_fr) || i.product_name;
      $("#sheet").innerHTML = `<button class="close" data-close>×</button><div class="done">
        <div class="tick">✓</div><h3>${t("thanks", { name: esc(o.name.split(" ")[0]) })}</h3>
        <p style="color:var(--muted)">${paid ? t("paid_ok") : o.payment_method === "PAY_ON_DELIVERY" ? t("confirmed") : t("awaiting")} ${t("sent_to", { email: esc(o.email) })}</p>
        <div class="ono">${t("order")} ${esc(o.order_no)}</div>
        <div style="max-width:420px;margin:6px auto 0;text-align:left">${o.items.map(i => `<div class="row"><span>${i.qty} × ${esc(iname(i))}</span><span>${money(i.line_total)}</span></div>`).join("")}
          <div class="row"><span>${t("delivery")}</span><span>${money(o.delivery_fee)}</span></div><div class="row"><span>${t("taxes")}</span><span>${money(o.gst + o.qst)}</span></div>
          <div class="row total"><span>${paid ? t("total_paid") : t("total")}</span><span>${money(o.grand_total)}</span></div></div>
        <p style="color:var(--muted);margin:14px 0 0">${o.fulfilment_type === "DELIVERY" ? t("delivery_to", { addr: esc(o.address) }) : t("pickup")} ${t("on")} <b>${esc(o.scheduled_date)}</b>, ${esc(o.time_slot || "")}</p>
        <a class="btn btn-green" href="#/shop" data-close style="margin-top:24px">${t("continue")}</a></div>`;
      openModal();
    } catch (e) { toast(t("not_found")); }
  }

  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("order/") && S.apiBase) {
      const [no, qs] = h.slice(6).split("?");
      const tok = new URLSearchParams(qs || "").get("t");
      $("#view-home").classList.remove("on"); $("#view-shop").classList.add("on");
      renderChips(); renderCatalogue(); renderCart(); showOrder(decodeURIComponent(no), tok);
      return;
    }
    if ($("#modal").classList.contains("on")) closeModal();
    const [page, sub] = h.split("/");
    const shop = page === "shop";
    $("#view-home").classList.toggle("on", !shop);
    $("#view-shop").classList.toggle("on", shop);
    $$(".nav a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#/" + (page || "")));
    $("#nav").classList.remove("open");
    if (shop) {
      activeCat = sub && CATS.some(c => c.code === sub) ? sub : "ALL";
      renderChips(); renderCatalogue(); renderCart();
      window.scrollTo({ top: 0 });
    } else {
      renderCart();
      const target = page ? document.getElementById(page) : null;
      if (target) setTimeout(() => target.scrollIntoView({ behavior: "smooth" }), 10); else window.scrollTo({ top: 0 });
    }
  }

  /* ==========================================================
     EVENTS
     ========================================================== */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-inc],[data-dec],[data-open],[data-close],[data-cat],[data-notify],[data-f],[data-lang],#checkoutBtn,#hdrCart,#mobCart,#cartClose,#menuBtn");
    if (!el) { if (e.target.id === "modal") closeModal(); return; }
    if (el.dataset.lang) setLang(el.dataset.lang);
    else if (el.dataset.inc) { const before = qtyOf(el.dataset.inc); setQty(el.dataset.inc, before + 1); if (!before) toast(t("added", { name: pn(bySku(el.dataset.inc)) })); }
    else if (el.dataset.dec) setQty(el.dataset.dec, qtyOf(el.dataset.dec) - 1);
    else if (el.dataset.open) openProduct(el.dataset.open);
    else if (el.hasAttribute("data-close")) closeModal();
    else if (el.dataset.cat) { location.hash = "#/shop" + (el.dataset.cat === "ALL" ? "" : "/" + el.dataset.cat); }
    else if (el.dataset.notify) openNotify(el.dataset.notify);
    else if (el.dataset.f) { fulfil = el.dataset.f; store.set("tanjo_fulfil", fulfil); $$(".fulfil button").forEach(b => b.classList.toggle("on", b.dataset.f === fulfil)); renderCart(); }
    else if (el.id === "checkoutBtn") { $("#cart").classList.remove("open"); openCheckout(); }
    else if (el.id === "hdrCart" || el.id === "mobCart") { if (!$("#view-shop").classList.contains("on")) location.hash = "#/shop"; setTimeout(() => $("#cart").classList.add("open"), 30); }
    else if (el.id === "cartClose") $("#cart").classList.remove("open");
    else if (el.id === "menuBtn") $("#nav").classList.toggle("open");
  });
  document.addEventListener("change", e => {
    if (e.target.name === "fulfilment") {
      fulfil = e.target.value; store.set("tanjo_fulfil", fulfil);
      $("#addrBlock").hidden = fulfil === "pickup";
      const pod = $("#podLabel"); if (pod) pod.textContent = t("co_pod", { where: fulfil === "pickup" ? t("co_pod_pickup") : t("co_pod_door") });
      $$(".fulfil button").forEach(b => b.classList.toggle("on", b.dataset.f === fulfil));
      renderCart(); renderSummary();
    }
  });
  document.addEventListener("submit", e => {
    if (e.target.id === "coForm") { e.preventDefault(); placeOrder(e.target); }
    if (e.target.id === "enquiryForm") { e.preventDefault(); submitEnquiry(e.target); }
    if (e.target.id === "notifyForm") {
      e.preventDefault();
      const f = e.target, email = f.elements.email.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { f.querySelector(".field").classList.add("err"); return; }
      fetch(S.apiBase + "/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: f.dataset.sku, email }) })
        .then(r => { if (!r.ok) throw 0; closeModal(); toast(t("notify_thanks")); })
        .catch(() => toast(t("try_again")));
    }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { closeModal(); $("#cart").classList.remove("open"); } });
  $("#q").addEventListener("input", e => { query = e.target.value; renderCatalogue(); });
  $("#sort").addEventListener("change", e => { sortBy = e.target.value; renderCatalogue(); });
  window.addEventListener("scroll", () => $("#hdr").classList.toggle("scrolled", scrollY > 8), { passive: true });
  window.addEventListener("hashchange", route);

  /* ---------- "notify me" ---------- */
  function openNotify(sku) {
    const p = bySku(sku); if (!p) return;
    if (!S.apiBase) { toast(t("notify_thanks")); return; }
    $("#sheet").innerHTML = `<button class="close" data-close>×</button><div class="co" style="max-width:460px">
      <h3>${t("notify_title", { name: esc(pn(p)) })}</h3><p class="sub">${t("notify_sub")}</p>
      <form id="notifyForm" data-sku="${esc(sku)}" novalidate><div class="field"><input name="email" type="email" placeholder="you@example.com" required><span class="msg">${t("email_err")}</span></div>
      <button class="btn btn-green" type="submit">${t("notify_me")}</button></form></div>`;
    openModal();
  }

  /* ---------- enquiry form ---------- */
  async function submitEnquiry(form) {
    let ok = true;
    $$(".field", form).forEach(f => f.classList.remove("err"));
    ["full_name", "email", "enquiry_type", "message"].forEach(n => {
      const el = form.elements[n]; let bad = !el.value.trim();
      if (n === "email" && !bad) bad = !/^\S+@\S+\.\S+$/.test(el.value);
      if (bad) { el.closest(".field").classList.add("err"); ok = false; }
    });
    if (!ok) return;
    if (S.apiBase) {
      try {
        const r = await fetch(S.apiBase + "/enquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), lang }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || t("try_again")); }
      } catch (e) { toast(e.message); return; }
    }
    form.style.display = "none"; $("#enquiryThanks").style.display = "block";
  }

  /* ---------- texts that depend on settings ---------- */
  function updateRibbon() {
    const r = $("#ribbon");
    if (S.apiBase && S.paymentMode === "MOCK") { r.removeAttribute("data-i18n"); r.textContent = t("ribbon_test"); r.hidden = false; }
    else r.hidden = !(S.sampleData && !S.apiBase);
  }
  function updateStatic() {
    $("#fulfilNote").textContent = t("fulfil_note", { min: money(S.minOrder) });
    if (S.pickupAddress) $("#ciAddress").textContent = S.pickupAddress;
    if (S.phone && S.phone.replace(/\D/g, "").length > 4) { $("#ciPhone").textContent = S.phone; $("#ciPhoneBox").hidden = false; }
    if (S.email) { const a = $("#ciEmail"); a.textContent = S.email; a.href = "mailto:" + S.email; $("#ciEmailBox").hidden = false; }
  }

  /* ---------- init ---------- */
  async function init() {
    $("#yr").textContent = new Date().getFullYear();
    applyPageLang();
    // Served by the Tanjo Foods API? -> live mode (relative path, so it works at / and at /v1/tanjo/)
    if (!S.apiBase && /^https?:$/.test(location.protocol)) {
      try { const r = await fetch("api/health"); if (r.ok) S.apiBase = "api"; } catch (e) { /* static hosting – demo mode */ }
    }
    if (S.apiBase) {
      try { const r = await fetch(S.apiBase + "/config"); if (r.ok) Object.assign(S, await r.json()); } catch (e) { console.warn("config unavailable", e); }
    }
    updateRibbon(); updateStatic();
    $$(".fulfil button").forEach(b => b.classList.toggle("on", b.dataset.f === fulfil));
    if (S.apiBase) {
      try {
        const r = await fetch(S.apiBase + "/products"); const j = await r.json();
        if (Array.isArray(j.products)) { PRODUCTS = j.products; if (j.categories) CATS = j.categories; }
      } catch (e) { console.warn("Product API unavailable – using bundled catalogue", e); }
    }
    // drop cart lines for products that no longer exist / are not orderable
    for (const sku of Object.keys(cart)) { const p = bySku(sku); if (!p || p.status !== "active") delete cart[sku]; }
    route();
  }
  init();
})();
