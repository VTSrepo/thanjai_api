# Deploying Release 2.0 to the cloud server (UAT)

The server that hosts pm.thanjaicaterers.com is used for UAT. Commands are for Linux (bash); Windows equivalents in brackets.

## 0. Before you start
- Node.js 18 LTS or later on the server: `node -v`
- MySQL user that can ALTER/CREATE tables in the Thanjai database.
- Port the API listens on (default 4002) and how it is started today (pm2 / systemd service / Windows service).

## 1. Back up the database (always)
```bash
mysqldump -u <user> -p --single-transaction --routines thanjai_restaurant > thanjai_before_r2_$(date +%Y%m%d).sql
```

## 2. Get the code
```bash
cd /path/to/thanjai_api            # existing clone, or: git clone https://github.com/VTSrepo/thanjai_api.git
git fetch origin
git checkout release/2.0
git pull
```
The UI is already built inside `client/build` – nothing to build on the server.

## 3. Settings (.env next to index.js)
Copy `.env.example` to `.env` (first time only) and fill in:

| Setting | UAT value |
|---|---|
| `ENV` | `production` |
| `HOST_PORT` | port the web server / proxy forwards to (default 4002) |
| `WRITE_DB_SRV_HOST`, `WRITE_DB_PORT`, `WRITE_DB_USER`, `WRITE_DB_PASSWORD`, `WRITE_DB_DATABASE` | cloud MySQL |
| `JWT_SECRET` | new long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_TTL` | `7d` |
| `CORS_ORIGINS` | `https://pm.thanjaicaterers.com,https://localhost,capacitor://localhost` |
| `INVOICE_TZ` | `America/Toronto` |
| `LOG_LEVEL` | empty (use `debug` only while troubleshooting) |

Never commit `.env`.

## 4. Install packages and migrate the database
```bash
npm ci --omit=dev        # [Windows: npm ci --omit=dev]
node migrations/run.js
```
Expected: one line per step (001 … 008_roles). On an already-migrated DB every step says "already present" / "OK".
If a step fails, stop and send the output – nothing after the failing step runs.

## 5. Restart the API
```bash
pm2 restart thanjai-api   # or: pm2 start index.js --name thanjai-api && pm2 save
# systemd: sudo systemctl restart thanjai-api      [Windows service: restart it in Services]
```

## 6. Smoke test (5 minutes)
1. Open `https://pm.thanjaicaterers.com/v1/` – login page shows **User ID**.
2. Log in as admin → Admin Home, menus: Indents, Batches, Inventory, Payments, Reports, Master.
3. Master → Role: five system roles listed.
4. Master → Branch: give the kitchens short codes (e.g. Central Kitchen `CK`, Thanjai Snacks `TS`).
5. Master → Product list import: load the Food Order List, set kitchens, apply.
6. Create one indent end to end: accept → finalize → add a batch → dispatch → receive → invoice PDF → record payment.

## 7. Roll back (if needed)
```bash
git checkout main && pm2 restart thanjai-api
mysql -u <user> -p thanjai_restaurant < thanjai_before_r2_YYYYMMDD.sql
```

## 8. After UAT – clear test transactions
When UAT fixes are deployed and signed off, `scripts/uat_cleanup.sql` empties the transaction tables (indents, invoices,
payments, batches, stock, timesheets, production) and resets the indent/invoice/receipt/batch numbers.
Masters (branches, products, prices, users, roles, reference data) are kept. Take a backup first.
