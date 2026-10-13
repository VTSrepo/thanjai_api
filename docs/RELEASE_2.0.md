# Thanjai Restaurant – Release 2.0 (UAT)

Branches: `release/2.0` in **thanjai_api** and **thanjai_ui**. The API repo carries the production UI build in `client/build`
(built from thanjai_ui `release/2.0` with `REACT_APP_MODE=production`, API = `https://pm.thanjaicaterers.com/v1`).

## What is new since the live version

**Security & users**
- JWT login with bcrypt passwords, forced password change on reset, password change/reset screens.
- Login with **User ID** (email optional); DOB removed from the user form.
- **Role Master**: admin defines roles and assigns screens (view / edit). New user type **Operations Manager**.
  Menus and page access follow the role. Default roles: Admin, Ops, Kitchen, Branch, External.
- Audit columns record the acting user; real DB errors logged, friendly messages on screen.

**Masters**
- Branch Master: address/tax fields (GST/HST, QST), ownership, credit terms, **2-letter short code**, external customers (type X).
- Product Master: **2–3 character short code** (batch prefix), producing kitchen, shelf life, default taxable flag, reorder level.
- **Product list import** (Master menu): upload the business product list, preview, apply. Matches by code then name, never deletes,
  price changes start a new dated price.

**Indent → invoice flow** (C → A → F → D → R)
- Kitchen **accepts** and enters the delivery date.
- Admin/Ops **finalize invoice setup**: per-item taxable flag, payment terms (Due on receipt, EOM, EONM, Net N days), extra charge lines.
- Kitchen **dispatches** from batches (oldest first, editable split; blocked when stock is short).
- Branch **receives**; the invoice is generated on received quantities with per-line GST/QST and batch numbers.
- Invoice PDF with tax column and batch line; invoice alerts; **Payments** (record full/part payments, receivables, overdue badge).

**Batches & inventory**
- Batch entry (`BR`+`PRD`+`MMDDYY`+serial), batch labels with Code128 barcode, manual close with reason, write-offs.
- Stock ledger, live daily inventory (opening / produced / dispatched / closing), stock alerts (shortfall, reorder, near best-before).
- One-time **opening stock import** from Excel.
- Batch reports: production by batch, traceability (where a batch went), wastage.

## Database changes

All changes are applied by `node migrations/run.js` (safe to re-run; prints one line per step):
001 branch tax fields · 002 invoicing · 003 security/users, credit terms, invoice payments · 004 widen `*_by` columns to 100 ·
005 drop UNIQUE(updated_by) on selling prices · 006 indent delivery date · 007 invoice setup, per-line tax ·
008 short codes, product batch fields, roles (`role_master`, `role_screen`, `user_master.role_id`), batches
(`batch_master`, `stock_movement`, `indent_batch_alloc`, `invoice_detail.batch_nos`) and default roles for every org.

Verified: the live schema (export of 29-Sep-2026) + `run.js` gives exactly the same tables, columns and indexes as the tested database.

## Not in this release
- Daily inventory snapshot / Day End (design pending business decision).
- Production Monitor is hidden (replaced by Batches).
