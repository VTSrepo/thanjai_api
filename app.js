const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const aqp = require("api-query-params");

const { UserAction } = require("./lib/action/user_action");
const { ProductAction } = require("./lib/action/product_action");
const { MasterAction } = require("./lib/action/master_action");
const { BusinessAction } = require("./lib/action/business_action");
const { IndentAction } = require("./lib/action/indent_action");
const { ProductionAction } = require("./lib/action/production_action");
const { DashboardAction } = require("./lib/action/dashboard_action");
const { TimesheetAction } = require("./lib/action/timesheet_action");
const { BranchModule } = require("./lib/modules/branch_module");
const { InvoiceModule } = require("./lib/modules/invoice_module");
const { PaymentModule } = require("./lib/modules/payment_module");
const { AuthModule } = require("./lib/modules/auth_module");
const { requireAuth, isBranchScoped, ROLES } = require("./common/auth");
const { roleModule } = require("./lib/modules/role_module");
const { batchModule } = require("./lib/modules/batch_module");
const { productImport } = require("./lib/modules/product_import_module");
const { subscriptionModule } = require("./lib/modules/subscription_module");
const BaseDao = require("./lib/dao/base_dao");

const app = express();
// Stripe webhook needs the raw body for its signature check, so it is registered before the JSON parser
app.post("/shop/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    res.json(await subscriptionModule.stripeWebhook(req.body, req.headers["stripe-signature"]));
  } catch (e) {
    console.error("Stripe webhook rejected:", e.message);
    res.status(400).json({ message: "Webhook error" });
  }
});
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

// ---- CORS: the web app, local development and the mobile app shells ----
const allowedOrigins = (process.env.CORS_ORIGINS ||
  "https://pm.thanjaicaterers.com,http://localhost:4002,http://localhost:3000,https://localhost,capacitor://localhost")
  .split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
}));

// React build (served under /v1 by server.js)
app.use("/", express.static(path.join(__dirname, "client", "build")));

const { A, O, B, K, X } = { A: ROLES.ADMIN, O: ROLES.OPS, B: ROLES.BRANCH, K: ROLES.KITCHEN, X: ROLES.EXTERNAL };
const ALL = null; // any logged-in user

const sendJson = (res, result) => {
  const code = result && Number.isInteger(result.status) ? result.status : 200;
  res.status(code).json(result);
};
const serverError = (res, err, where) => {
  console.error(`${where} failed:`, err && (err.message || err));
  sendJson(res, { status: 500, code: 5001, message: "Sorry, Internal Server Error!." });
};

// Legacy action classes use a Lambda-style (event, context.done) interface.
const runLegacy = (ActionClass, method) => (req, res) => {
  const event = {
    stageVariables: { env: "dev" },
    headers: req.headers,
    body: req.body,
    pathParameters: req.params,
    queryParameters: aqp(req.query),
    user: req.user,
  };
  new ActionClass()[method](event, {
    done: (rescode, resmsg) => {
      const headers = { ...(resmsg.headers || {}) };
      Object.keys(headers).forEach((h) => h.toLowerCase().startsWith("access-control-") && delete headers[h]);
      res.header(headers);
      res.status(resmsg.statusCode);
      res.send(resmsg.body);
    },
  });
};

// Route helper: api("get", "/path", roles, ...handlers)
const api = (method, route, roles, ...handlers) => app[method](route, requireAuth(roles), ...handlers);
const wrap = (fn, where) => async (req, res) => {
  try {
    sendJson(res, await fn(req, res));
  } catch (err) {
    serverError(res, err, where);
  }
};

// ---- Indent access rules --------------------------------------------------
const db = new BaseDao();
const findIndent = async (org_id, indent_number) => {
  const conn = await db.getReadConnection();
  try {
    const rows = await conn.query(
      `SELECT indent_number, branch_id, kitchen_id, status FROM indent_header WHERE org_id = ? AND indent_number = ? LIMIT 1`,
      [org_id, indent_number]);
    return rows[0] || null;
  } finally {
    await db.releaseReadConnection(conn);
  }
};
const forbidden = (res, message = "You do not have access to this indent") =>
  res.status(403).json({ status: 403, code: "FORBIDDEN", message });

// Branch / external users only list their own branch's indents
const scopeIndentList = (req, res, next) => {
  if (isBranchScoped(req.user)) req.query.branch_id = req.user.branch_id;
  next();
};

// Branch / external users only open their own branch's indents
const checkIndentOwner = async (req, res, next) => {
  if (!isBranchScoped(req.user)) return next();
  try {
    const ind = await findIndent(req.user.org_id, req.query.indent_number);
    if (ind && ind.branch_id !== req.user.branch_id) return forbidden(res);
    next();
  } catch (err) {
    serverError(res, err, "Indent access check");
  }
};

const checkIndentOwnerParam = async (req, res, next) => {
  if (!isBranchScoped(req.user)) return next();
  try {
    const ind = await findIndent(req.user.org_id, req.params.indent_number);
    if (ind && ind.branch_id !== req.user.branch_id) return forbidden(res);
    next();
  } catch (err) {
    serverError(res, err, "Indent access check");
  }
};

// Who may move an indent to which status (BRD): C by branch/external, A & D by kitchen, R by branch/external.
// F (invoice finalized) is set only through /invoice-setup by admin.
const TRANSITIONS = { C: [B, X], A: [K], D: [K], R: [B, X] };
// Required current status for each move: accept a new indent, dispatch only after admin finalized the invoice, receive after dispatch.
const FROM_STATUS = { A: ["C"], D: ["F"], R: ["D"] };
const checkIndentWrite = async (req, res, next) => {
  const u = req.user;
  const indent = (req.body && req.body.indent) || {};
  indent.org_id = u.org_id;
  try {
    if (!indent.indent_number) {
      if (![B, X].includes(u.user_type)) return forbidden(res, "Only branch or customer users can raise an indent");
      indent.branch_id = u.branch_id;
      indent.user_id = u.user_id;
      indent.status = "C";
      return next();
    }
    const existing = await findIndent(u.org_id, indent.indent_number);
    if (!existing) return forbidden(res, "Indent not found");
    if (isBranchScoped(u) && existing.branch_id !== u.branch_id) return forbidden(res);
    const allowed = TRANSITIONS[indent.status] || [];
    if (u.user_type !== A && !allowed.includes(u.user_type)) {
      return forbidden(res, "You cannot move this indent to that status");
    }
    const from = FROM_STATUS[indent.status];
    if (!from || !from.includes(existing.status)) {
      const msg = indent.status === "D" && existing.status === "A"
        ? "Waiting for admin to finalize the invoice before dispatch"
        : "This indent has already moved on. Refresh and try again.";
      return res.status(409).json({ status: 409, code: "WRONG_STATUS", message: msg });
    }
    indent.branch_id = existing.branch_id;
    indent.user_id = u.user_id;
    next();
  } catch (err) {
    serverError(res, err, "Indent write check");
  }
};

// Dispatch (F -> D): take stock from batches (chosen split or oldest first). Blocks when batch stock is short.
// If the indent update then fails, the stock is put back.
const dispatchBatches = async (req, res, next) => {
  const indent = (req.body && req.body.indent) || {};
  if (indent.status !== "D") return next();
  try {
    const existing = await findIndent(req.user.org_id, indent.indent_number);
    const target = { indent_number: indent.indent_number, kitchen_id: existing.kitchen_id };
    const r = await batchModule.applyDispatch(req.user, target, indent.indent_details || [], indent.batch_alloc || {});
    if (!r.ok) return res.status(r.status).json(r);
    delete indent.batch_alloc;
    if (r.applied.length) {
      const send = res.send.bind(res);
      res.send = (body) => {
        if (res.statusCode >= 300) {
          batchModule.reverseDispatch(req.user, target, r.applied).finally(() => send(body));
          return res;
        }
        return send(body);
      };
    }
    next();
  } catch (err) {
    serverError(res, err, "Dispatch batches");
  }
};

// ---- Auth -------------------------------------------------------------------
const authModule = new AuthModule();
app.post("/login", wrap(async (req) => {
  const u = (req.body && req.body.user) || {};
  const r = await authModule.login(u.user_id, u.pwd);
  if (r && r.user) r.user.screens = await roleModule.permissionsFor(r.user);
  return r;
}, "Login"));
// Current user's screens (the app refreshes these on start so role changes apply without re-login)
api("get", "/me", ALL, wrap(async (req) => ({
  status: 200, code: 200, message: "Success", user: { ...req.user, screens: await roleModule.permissionsFor(req.user) },
}), "Me"));

// ---- Role Master ---------------------------------------------------------------
api("get", "/roles/:org_id", ["M_ROLE", "M_USER"], wrap((req) => roleModule.list(req.user.org_id), "Roles"));
api("post", "/role", ["M_ROLE:E"], wrap((req) => roleModule.save(req.user, req.body), "Save role"));
api("post", "/role/delete", ["M_ROLE:E"], wrap((req) => roleModule.remove(req.user, req.body.role_id), "Delete role"));
api("post", "/change-password", ALL, wrap((req) =>
  authModule.changePassword(req.user, req.body.current_pwd, req.body.new_pwd), "Change password"));
api("post", "/users/reset-password", ["M_USER:E"], wrap((req) =>
  authModule.resetPassword(req.user, req.body.user_id, req.body.temp_pwd), "Reset password"));

// ---- Existing screens (legacy actions) --------------------------------------
api("get", "/product/:product_id", ALL, runLegacy(ProductAction, "GetProductDetail"));
api("post", "/product", ["M_PRODUCT:E"], runLegacy(ProductAction, "CreateProduct"));
api("get", "/products/:org_id", ALL, runLegacy(ProductAction, "GetProductMasterOrgId"));
api("get", "/branchproducts/:branch_id", ALL, runLegacy(ProductAction, "GetProducts"));
api("get", "/prodsellingprice/:product_id", ["M_PRODUCT"], runLegacy(ProductAction, "GetProductSellingPrice"));
api("post", "/sellingprice", ["M_PRODUCT:E"], runLegacy(ProductAction, "CreateProductPricing"));
api("get", "/references/:ref_type", ALL, runLegacy(MasterAction, "GetReferenceList"));
api("get", "/business/:org_id", ALL, runLegacy(BusinessAction, "GetBusiness"));
api("get", "/business/:org_id/:bu_id", ALL, runLegacy(BusinessAction, "GetBusinessDetail"));
api("get", "/category", ALL, runLegacy(ProductAction, "GetCategoryList"));
api("post", "/indent", [A, B, K, X], checkIndentWrite, dispatchBatches, runLegacy(IndentAction, "createIndent"));
api("get", "/indents/:org_id", ALL, scopeIndentList, runLegacy(IndentAction, "GetIndentList"));
api("get", "/indentdetail/:org_id", ALL, checkIndentOwner, runLegacy(IndentAction, "GetIndentDetail"));
api("get", "/indent-report/:org_id", ["R_INDENT"], runLegacy(IndentAction, "GetIndentReport"));
api("get", "/production-monitoring/:org_id", [A, K], runLegacy(ProductionAction, "GetProductions"));
api("post", "/production-monitoring", [A, K], runLegacy(ProductionAction, "CreateProduction"));
api("get", "/employees/:org_id", [K, "M_EMPLOYEE", "TIMESHEET"], runLegacy(ProductionAction, "GetEmployees"));
api("get", "/product-dashboard/:org_id", ["DASHBOARD", "R_PRODUCTION"], runLegacy(DashboardAction, "GetProductDashboard"));
api("post", "/employee", ["M_EMPLOYEE:E"], runLegacy(ProductionAction, "CreateEmployee"));
api("get", "/production-report/:org_id", ["R_PRODUCTION"], runLegacy(DashboardAction, "GetProductionReport"));
api("get", "/timesheet/:org_id", [K, "TIMESHEET"], runLegacy(TimesheetAction, "GetTimesheets"));
api("post", "/timesheet", [K, "TIMESHEET:E"], runLegacy(TimesheetAction, "CreateTimesheet"));
api("get", "/branches/:org_id", ALL, runLegacy(MasterAction, "GetBranchList"));
api("get", "/users/:org_id", ["M_USER"], runLegacy(UserAction, "GetUserList"));
api("post", "/createuser", ["M_USER:E"], runLegacy(UserAction, "CreateUser"));
api("post", "/updateuser", ["M_USER:E"], runLegacy(UserAction, "UpdateUser"));
api("get", "/categories", ALL, runLegacy(MasterAction, "GetCategoryList"));
api("post", "/category", ["M_CATEGORY:E"], runLegacy(MasterAction, "CreateCategory"));

// ---- Branch Master (admin) ----------------------------------------------------
const branchModule = new BranchModule();
api("get", "/branch/:org_id/:branch_id", ["M_BRANCH"], wrap((req) =>
  branchModule.getBranch(req.params.org_id, req.params.branch_id), "Get branch"));
api("post", "/branch", ["M_BRANCH:E"], wrap((req) =>
  branchModule.saveBranch({ ...(req.body.branch || {}), org_id: req.user.org_id }, req.user.user_id), "Save branch"));

// ---- Invoicing ------------------------------------------------------------------
const invoiceModule = new InvoiceModule();
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// Report: indents in a date range with invoice / estimated amounts (admin)
api("get", "/invoices/:org_id", ["R_INVOICES"], wrap((req) => {
  const { from_date, to_date, branch_id } = req.query;
  if (!isDate(from_date) || !isDate(to_date)) {
    return { status: 400, code: 4000, message: "from_date and to_date (YYYY-MM-DD) are required" };
  }
  return invoiceModule.listIndents(req.params.org_id, { from_date, to_date, branch_id: branch_id || null });
}, "Invoice list"));

// One invoice: admin, or the billed branch / customer
api("get", "/invoice/:org_id/:invoice_number", [B, X, "R_INVOICES", "PAYMENTS", "INVOICE_SETUP", "INDENTS"], wrap(async (req) => {
  const r = await invoiceModule.getInvoice(req.params.org_id, req.params.invoice_number);
  if (r.invoice && isBranchScoped(req.user) && r.invoice.branch_id !== req.user.branch_id) {
    return { status: 403, code: "FORBIDDEN", message: "You do not have access to this invoice" };
  }
  return r;
}, "Get invoice"));

// Generate for a received indent (returns the existing one if already generated)
api("post", "/invoice/generate", [B, X, "R_INVOICES", "PAYMENTS", "INDENTS"], wrap(async (req) => {
  const { indent_number } = req.body || {};
  if (isBranchScoped(req.user)) {
    const ind = await findIndent(req.user.org_id, indent_number);
    if (ind && ind.branch_id !== req.user.branch_id) {
      return { status: 403, code: "FORBIDDEN", message: "You do not have access to this indent" };
    }
  }
  return invoiceModule.generate(req.user.org_id, indent_number, req.user.user_id);
}, "Generate invoice"));

// ---- Payments & receivables -----------------------------------------------------
// Admin invoice setup between kitchen accept (A) and dispatch: per-item tax, payment terms, extra charges.
// Finalizing moves the indent to F; only then can the kitchen dispatch.
api("get", "/invoice-setup/:org_id/:indent_number", ["INVOICE_SETUP"], wrap((req) =>
  invoiceModule.getSetup(req.user.org_id, req.params.indent_number), "Invoice setup"));
api("post", "/invoice-setup", ["INVOICE_SETUP:E"], wrap((req) => invoiceModule.saveSetup(req.user, req.body), "Save invoice setup"));

// ---- Batches, inventory, stock alerts --------------------------------------------
const dateRange = (q) => ({ from_date: q.from_date, to_date: q.to_date });
api("get", "/batches/:org_id", ["BATCHES", "INVENTORY", "R_BATCH"], wrap((req) => batchModule.list(req.user.org_id, req.query), "Batches"));
api("get", "/batch-trace/:org_id/:batch_no", ["BATCHES", "R_BATCH"], wrap((req) =>
  batchModule.trace(req.user.org_id, req.params.batch_no), "Batch trace"));
api("post", "/batch", ["BATCHES:E"], wrap((req) => batchModule.create(req.user, req.body || {}), "Create batch"));
api("post", "/batch/update", ["BATCHES:E"], wrap((req) => batchModule.update(req.user, req.body || {}), "Update batch"));
api("post", "/batch/close", ["BATCHES:E"], wrap((req) => batchModule.close(req.user, req.body || {}), "Close batch"));
api("post", "/stock-import", ["STOCK_IMPORT:E"], wrap((req) => batchModule.importOpening(req.user, (req.body || {}).rows), "Stock import"));
api("get", "/product-settings/:org_id", ALL, wrap((req) => batchModule.productSettings(req.user.org_id), "Product settings"));
api("post", "/product-settings", ["M_PRODUCT:E"], wrap((req) => batchModule.saveProductSettings(req.user, req.body || {}), "Save product settings"));
// Product Master bulk update from Excel (preview first, then apply)
api("post", "/product-import", ["M_PRODUCT:E"], wrap((req) => productImport.run(req.user, req.body || {}), "Product import"));

// ---- Online shop (weekly meal subscriptions) ---------------------------------------
// public
app.get("/shop/info", wrap(() => subscriptionModule.shopInfo(), "Shop info"));
app.get("/shop/zone-check", wrap((req) => subscriptionModule.zoneCheck(req.query.postal), "Zone check"));
app.post("/shop/signup", wrap((req) => subscriptionModule.signup(req.body || {}), "Shop signup"));
app.post("/shop/login", wrap((req) => subscriptionModule.login(req.body || {}), "Shop login"));
// subscriber (type S)
const S = ROLES.SUBSCRIBER;
api("get", "/shop/me", [S], wrap((req) => subscriptionModule.me(req.user), "Shop account"));
api("post", "/shop/profile", [S], wrap((req) => subscriptionModule.updateProfile(req.user, req.body || {}), "Shop profile"));
api("post", "/shop/password", [S], wrap((req) => subscriptionModule.changePassword(req.user, req.body || {}), "Shop password"));
api("post", "/shop/start", [S], wrap((req) => subscriptionModule.start(req.user, req.body || {}), "Shop start"));
api("get", "/shop/pay/confirm", [S], wrap((req) => subscriptionModule.confirmPayment(req.user, req.query.ref), "Shop payment confirm"));
api("post", "/shop/meals", [S], wrap((req) => subscriptionModule.saveMeals(req.user, req.body || {}), "Shop meals"));
api("post", "/shop/skip", [S], wrap((req) => subscriptionModule.skipWeek(req.user, req.body || {}), "Shop skip"));
api("post", "/shop/subscription", [S], wrap((req) => subscriptionModule.manageSubscription(req.user, req.body || {}), "Shop subscription"));
api("post", "/shop/card", [S], wrap((req) => subscriptionModule.cardSetup(req.user, req.body || {}), "Shop card"));
api("get", "/shop/card/confirm", [S], wrap((req) => subscriptionModule.cardConfirm(req.user, req.query.ref), "Shop card confirm"));
// staff
api("get", "/sub/settings/:org_id", ["SUB_SETUP", "SUB_ORDERS"], wrap((req) => subscriptionModule.getSettings(req.user.org_id), "Shop settings"));
api("post", "/sub/settings", ["SUB_SETUP:E"], wrap((req) => subscriptionModule.saveSettings(req.user, req.body || {}), "Save shop settings"));
api("get", "/sub/plans/:org_id", ["SUB_SETUP", "SUB_CUSTOMERS"], wrap((req) => subscriptionModule.listPlans(req.user.org_id), "Plans"));
api("post", "/sub/plan", ["SUB_SETUP:E"], wrap((req) => subscriptionModule.savePlan(req.user, req.body || {}), "Save plan"));
api("get", "/sub/zones/:org_id", ["SUB_SETUP", "SUB_ORDERS"], wrap((req) => subscriptionModule.listZones(req.user.org_id), "Zones"));
api("post", "/sub/zone", ["SUB_SETUP:E"], wrap((req) => subscriptionModule.saveZone(req.user, req.body || {}), "Save zone"));
api("get", "/sub/dishes/:org_id", ["SUB_SETUP"], wrap((req) => subscriptionModule.listDishes(req.user.org_id), "Dishes"));
api("post", "/sub/dish", ["SUB_SETUP:E"], wrap((req) => subscriptionModule.saveDish(req.user, req.body || {}), "Save dish"));
api("get", "/sub/weeks/:org_id", ["SUB_SETUP", "SUB_ORDERS"], wrap((req) => subscriptionModule.listWeeks(req.user.org_id), "Menu weeks"));
api("get", "/sub/week/:org_id/:date", ["SUB_SETUP", "SUB_ORDERS"], wrap((req) => subscriptionModule.getWeek(req.user.org_id, req.params.date), "Menu week"));
api("post", "/sub/week", ["SUB_SETUP:E"], wrap((req) => subscriptionModule.saveWeek(req.user, req.body || {}), "Save menu week"));
api("get", "/sub/orders/:org_id/:date", ["SUB_ORDERS"], wrap((req) => subscriptionModule.weekOrders(req.user.org_id, req.params.date), "Online orders"));
api("post", "/sub/cutoff", ["SUB_ORDERS:E"], wrap((req) => subscriptionModule.runCutoff(req.user, (req.body || {}).delivery_date), "Cutoff"));
api("post", "/sub/kitchen", ["SUB_ORDERS:E"], wrap((req) => subscriptionModule.sendToKitchen(req.user, (req.body || {}).delivery_date), "Send to kitchen"));
api("post", "/sub/order/charge", ["SUB_ORDERS:E"], wrap((req) => subscriptionModule.chargeOrder(req.user, req.body || {}), "Charge order"));
api("post", "/sub/order/status", ["SUB_ORDERS:E"], wrap((req) => subscriptionModule.setOrderStatus(req.user, req.body || {}), "Order status"));
api("get", "/sub/customers/:org_id", ["SUB_CUSTOMERS"], wrap((req) => subscriptionModule.listCustomers(req.user.org_id, req.query.q), "Subscribers"));
api("get", "/sub/customer/:org_id/:customer_id", ["SUB_CUSTOMERS"], wrap((req) => subscriptionModule.customerDetail(req.user.org_id, req.params.customer_id), "Subscriber"));
// Suggested split for the dispatch screen (kitchen); qty may be overridden with ?qty=ITEM:QTY,ITEM:QTY
api("get", "/batch-suggest/:org_id/:indent_number", [K, "INDENTS"], wrap((req) => {
  const qty = Object.fromEntries(String(req.query.qty || "").split(",").filter(Boolean).map((p) => p.split(":")));
  return batchModule.suggest(req.user.org_id, req.params.indent_number, qty);
}, "Batch suggest"));
api("get", "/indent-batches/:org_id/:indent_number", ALL, checkIndentOwnerParam, wrap((req) =>
  batchModule.indentAllocations(req.user.org_id, req.params.indent_number), "Indent batches"));
api("get", "/stock/:org_id", [K, "INVENTORY", "DASHBOARD"], wrap((req) => batchModule.current(req.user, req.query), "Stock"));
api("get", "/stock-daily/:org_id", [K, "INVENTORY"], wrap((req) => batchModule.daily(req.user, req.query), "Stock daily"));
api("get", "/stock-alerts/:org_id", [K, "INVENTORY", "DASHBOARD", "BATCHES"], wrap((req) => batchModule.alerts(req.user), "Stock alerts"));
api("get", "/wastage/:org_id", ["R_BATCH", "INVENTORY"], wrap((req) => batchModule.wastage(req.user.org_id, dateRange(req.query)), "Wastage"));

const paymentModule = new PaymentModule();
const scopedBranch = (req) => (isBranchScoped(req.user) ? req.user.branch_id : req.query.branch_id || null);

// Open / all invoices with balances (admin: any customer; branch & external: own)
api("get", "/receivables/:org_id", [B, X, "PAYMENTS", "R_INVOICES", "DASHBOARD"], wrap((req) =>
  paymentModule.listInvoices(req.params.org_id, {
    branch_id: scopedBranch(req),
    status: req.query.status || "open",
    from_date: isDate(req.query.from_date) ? req.query.from_date : null,
    to_date: isDate(req.query.to_date) ? req.query.to_date : null,
  }), "Receivables"));

api("get", "/receivables-summary/:org_id", [B, X, "PAYMENTS", "R_INVOICES", "DASHBOARD"], wrap((req) =>
  paymentModule.summary(req.params.org_id, scopedBranch(req)), "Receivables summary"));

api("get", "/invoice-payments/:org_id/:invoice_number", [B, X, "PAYMENTS", "R_INVOICES"], wrap(async (req) => {
  const r = await paymentModule.payments(req.params.org_id, req.params.invoice_number);
  if (r.invoice && isBranchScoped(req.user) && r.invoice.branch_id !== req.user.branch_id) {
    return { status: 403, code: "FORBIDDEN", message: "You do not have access to this invoice" };
  }
  return r;
}, "Invoice payments"));

api("post", "/payment", ["PAYMENTS:E"], wrap((req) =>
  paymentModule.record(req.user, req.body || {}), "Record payment"));
api("post", "/payment/void", ["PAYMENTS:E"], wrap((req) =>
  paymentModule.voidPayment(req.user, req.body || {}), "Void payment"));
api("post", "/invoice/terms", ["PAYMENTS:E"], wrap((req) =>
  paymentModule.changeTerms(req.user, req.body || {}), "Change invoice terms"));

// ---- Single-page app: everything else serves index.html ------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

module.exports = app;
