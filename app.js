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
const BaseDao = require("./lib/dao/base_dao");

const app = express();
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

const { A, B, K, X } = { A: ROLES.ADMIN, B: ROLES.BRANCH, K: ROLES.KITCHEN, X: ROLES.EXTERNAL };
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

// ---- Auth -------------------------------------------------------------------
const authModule = new AuthModule();
app.post("/login", wrap((req) => {
  const u = (req.body && req.body.user) || {};
  return authModule.login(u.user_id, u.pwd);
}, "Login"));
api("post", "/change-password", ALL, wrap((req) =>
  authModule.changePassword(req.user, req.body.current_pwd, req.body.new_pwd), "Change password"));
api("post", "/users/reset-password", [A], wrap((req) =>
  authModule.resetPassword(req.user, req.body.user_id, req.body.temp_pwd), "Reset password"));

// ---- Existing screens (legacy actions) --------------------------------------
api("get", "/product/:product_id", ALL, runLegacy(ProductAction, "GetProductDetail"));
api("post", "/product", [A], runLegacy(ProductAction, "CreateProduct"));
api("get", "/products/:org_id", ALL, runLegacy(ProductAction, "GetProductMasterOrgId"));
api("get", "/branchproducts/:branch_id", ALL, runLegacy(ProductAction, "GetProducts"));
api("get", "/prodsellingprice/:product_id", [A], runLegacy(ProductAction, "GetProductSellingPrice"));
api("post", "/sellingprice", [A], runLegacy(ProductAction, "CreateProductPricing"));
api("get", "/references/:ref_type", ALL, runLegacy(MasterAction, "GetReferenceList"));
api("get", "/business/:org_id", ALL, runLegacy(BusinessAction, "GetBusiness"));
api("get", "/business/:org_id/:bu_id", ALL, runLegacy(BusinessAction, "GetBusinessDetail"));
api("get", "/category", ALL, runLegacy(ProductAction, "GetCategoryList"));
api("post", "/indent", [A, B, K, X], checkIndentWrite, runLegacy(IndentAction, "createIndent"));
api("get", "/indents/:org_id", ALL, scopeIndentList, runLegacy(IndentAction, "GetIndentList"));
api("get", "/indentdetail/:org_id", ALL, checkIndentOwner, runLegacy(IndentAction, "GetIndentDetail"));
api("get", "/indent-report/:org_id", [A], runLegacy(IndentAction, "GetIndentReport"));
api("get", "/production-monitoring/:org_id", [A, K], runLegacy(ProductionAction, "GetProductions"));
api("post", "/production-monitoring", [A, K], runLegacy(ProductionAction, "CreateProduction"));
api("get", "/employees/:org_id", [A, K], runLegacy(ProductionAction, "GetEmployees"));
api("get", "/product-dashboard/:org_id", [A], runLegacy(DashboardAction, "GetProductDashboard"));
api("post", "/employee", [A], runLegacy(ProductionAction, "CreateEmployee"));
api("get", "/production-report/:org_id", [A], runLegacy(DashboardAction, "GetProductionReport"));
api("get", "/timesheet/:org_id", [A, K], runLegacy(TimesheetAction, "GetTimesheets"));
api("post", "/timesheet", [A, K], runLegacy(TimesheetAction, "CreateTimesheet"));
api("get", "/branches/:org_id", ALL, runLegacy(MasterAction, "GetBranchList"));
api("get", "/users/:org_id", [A], runLegacy(UserAction, "GetUserList"));
api("post", "/createuser", [A], runLegacy(UserAction, "CreateUser"));
api("post", "/updateuser", [A], runLegacy(UserAction, "UpdateUser"));
api("get", "/categories", ALL, runLegacy(MasterAction, "GetCategoryList"));
api("post", "/category", [A], runLegacy(MasterAction, "CreateCategory"));

// ---- Branch Master (admin) ----------------------------------------------------
const branchModule = new BranchModule();
api("get", "/branch/:org_id/:branch_id", [A], wrap((req) =>
  branchModule.getBranch(req.params.org_id, req.params.branch_id), "Get branch"));
api("post", "/branch", [A], wrap((req) =>
  branchModule.saveBranch({ ...(req.body.branch || {}), org_id: req.user.org_id }, req.user.user_id), "Save branch"));

// ---- Invoicing ------------------------------------------------------------------
const invoiceModule = new InvoiceModule();
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// Report: indents in a date range with invoice / estimated amounts (admin)
api("get", "/invoices/:org_id", [A], wrap((req) => {
  const { from_date, to_date, branch_id } = req.query;
  if (!isDate(from_date) || !isDate(to_date)) {
    return { status: 400, code: 4000, message: "from_date and to_date (YYYY-MM-DD) are required" };
  }
  return invoiceModule.listIndents(req.params.org_id, { from_date, to_date, branch_id: branch_id || null });
}, "Invoice list"));

// One invoice: admin, or the billed branch / customer
api("get", "/invoice/:org_id/:invoice_number", [A, B, X], wrap(async (req) => {
  const r = await invoiceModule.getInvoice(req.params.org_id, req.params.invoice_number);
  if (r.invoice && isBranchScoped(req.user) && r.invoice.branch_id !== req.user.branch_id) {
    return { status: 403, code: "FORBIDDEN", message: "You do not have access to this invoice" };
  }
  return r;
}, "Get invoice"));

// Generate for a received indent (returns the existing one if already generated)
api("post", "/invoice/generate", [A, B, X], wrap(async (req) => {
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
api("get", "/invoice-setup/:org_id/:indent_number", [A], wrap((req) =>
  invoiceModule.getSetup(req.user.org_id, req.params.indent_number), "Invoice setup"));
api("post", "/invoice-setup", [A], wrap((req) => invoiceModule.saveSetup(req.user, req.body), "Save invoice setup"));

const paymentModule = new PaymentModule();
const scopedBranch = (req) => (isBranchScoped(req.user) ? req.user.branch_id : req.query.branch_id || null);

// Open / all invoices with balances (admin: any customer; branch & external: own)
api("get", "/receivables/:org_id", [A, B, X], wrap((req) =>
  paymentModule.listInvoices(req.params.org_id, {
    branch_id: scopedBranch(req),
    status: req.query.status || "open",
    from_date: isDate(req.query.from_date) ? req.query.from_date : null,
    to_date: isDate(req.query.to_date) ? req.query.to_date : null,
  }), "Receivables"));

api("get", "/receivables-summary/:org_id", [A, B, X], wrap((req) =>
  paymentModule.summary(req.params.org_id, scopedBranch(req)), "Receivables summary"));

api("get", "/invoice-payments/:org_id/:invoice_number", [A, B, X], wrap(async (req) => {
  const r = await paymentModule.payments(req.params.org_id, req.params.invoice_number);
  if (r.invoice && isBranchScoped(req.user) && r.invoice.branch_id !== req.user.branch_id) {
    return { status: 403, code: "FORBIDDEN", message: "You do not have access to this invoice" };
  }
  return r;
}, "Invoice payments"));

api("post", "/payment", [A], wrap((req) =>
  paymentModule.record(req.user, req.body || {}), "Record payment"));
api("post", "/payment/void", [A], wrap((req) =>
  paymentModule.voidPayment(req.user, req.body || {}), "Void payment"));
api("post", "/invoice/terms", [A], wrap((req) =>
  paymentModule.changeTerms(req.user, req.body || {}), "Change invoice terms"));

// ---- Single-page app: everything else serves index.html ------------------------
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

module.exports = app;
