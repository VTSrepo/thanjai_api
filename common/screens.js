// Screens that a role can be given (Role Master). Codes are stored in role_screen.
// Level: V = view only, E = view and change. Admin users (type A) always have everything.
const SCREENS = [
  { code: 'DASHBOARD', label: 'Admin home (alerts, charts)', group: 'General' },
  { code: 'HOME', label: 'Branch / customer home', group: 'General' },
  { code: 'INDENTS', label: 'Indents', group: 'Operations' },
  { code: 'INVOICE_SETUP', label: 'Finalize invoice (tax, terms, charges)', group: 'Operations' },
  { code: 'BATCHES', label: 'Batch entry', group: 'Operations' },
  { code: 'INVENTORY', label: 'Inventory & stock alerts', group: 'Operations' },
  { code: 'STOCK_IMPORT', label: 'Opening stock import', group: 'Operations' },
  { code: 'TIMESHEET', label: 'Timesheet', group: 'Operations' },
  { code: 'PAYMENTS', label: 'Payments', group: 'Finance' },
  { code: 'MY_INVOICES', label: 'My invoices', group: 'Finance' },
  { code: 'R_INVOICES', label: 'Invoices report', group: 'Reports' },
  { code: 'R_INDENT', label: 'Indent report', group: 'Reports' },
  { code: 'R_PRODUCTION', label: 'Production report', group: 'Reports' },
  { code: 'R_BATCH', label: 'Batch reports (production, traceability, wastage)', group: 'Reports' },
  { code: 'M_PRODUCT', label: 'Product master', group: 'Masters' },
  { code: 'M_EMPLOYEE', label: 'Employee master', group: 'Masters' },
  { code: 'M_USER', label: 'User master', group: 'Masters' },
  { code: 'M_CATEGORY', label: 'Category master', group: 'Masters' },
  { code: 'M_BRANCH', label: 'Branch master', group: 'Masters' },
  { code: 'M_ROLE', label: 'Role master', group: 'Masters' },
];
const SCREEN_CODES = new Set(SCREENS.map((s) => s.code));

// User types (data scope). Role decides screens; type decides whose data is visible.
const USER_TYPES = {
  A: 'Admin', O: 'Operations Manager', K: 'Kitchen', B: 'Branch', X: 'External customer',
};

const all = (lvl) => Object.fromEntries(SCREENS.map((s) => [s.code, lvl]));

// Seeded once per organisation by the migration; editable afterwards (except ADMIN).
const DEFAULT_ROLES = [
  { role_id: 'ADMIN', role_name: 'Admin', scope: 'A', description: 'Full access', screens: all('E') },
  {
    role_id: 'OPS', role_name: 'Operations Manager', scope: 'O',
    description: 'Batches, inventory, invoices and payments',
    screens: {
      DASHBOARD: 'V', INDENTS: 'V', INVOICE_SETUP: 'E', BATCHES: 'E', INVENTORY: 'E', STOCK_IMPORT: 'E',
      PAYMENTS: 'E', R_INVOICES: 'V', R_INDENT: 'V', R_PRODUCTION: 'V', R_BATCH: 'V', M_PRODUCT: 'V',
    },
  },
  {
    role_id: 'KITCHEN', role_name: 'Kitchen', scope: 'K', description: 'Accept and dispatch indents',
    screens: { INDENTS: 'E', INVENTORY: 'V', TIMESHEET: 'E' },
  },
  {
    role_id: 'BRANCH', role_name: 'Branch', scope: 'B', description: 'Order, receive, invoices',
    screens: { HOME: 'V', INDENTS: 'E', MY_INVOICES: 'V' },
  },
  {
    role_id: 'EXTERNAL', role_name: 'External customer', scope: 'X', description: 'Order, receive, invoices',
    screens: { HOME: 'V', INDENTS: 'E', MY_INVOICES: 'V' },
  },
];
const DEFAULT_ROLE_FOR_TYPE = { A: 'ADMIN', O: 'OPS', K: 'KITCHEN', B: 'BRANCH', X: 'EXTERNAL' };

module.exports = { SCREENS, SCREEN_CODES, USER_TYPES, DEFAULT_ROLES, DEFAULT_ROLE_FOR_TYPE };
