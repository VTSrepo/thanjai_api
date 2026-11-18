# Tanjo Foods – e-commerce site

Separate storefront for Tanjore Group's ready-to-cook and ready-to-eat products.
Content comes from the client's "website content" Google doc (Drive folder *Tanjo Foods*).

## Where it runs
| | Address | Settings |
|---|---|---|
| Stand-alone (local testing) | `cd api` → `npm start` → http://localhost:4100/ | `api/.env` (plain names: `DB_HOST` …) |
| Inside the Thanjai API (UAT / production) | https://pm.thanjaicaterers.com/v1/tanjo/ – mounted by `app.use("/tanjo", require("./tanjofoods/api/app"))` | `TANJO_*` lines in thanjai_api `.env` – see thanjai_api `docs/DEPLOY_TANJO.md` |

All pages use relative links, so the same files work at `/` and at `/v1/tanjo/`. Both ways use the separate **Tanjofoods** database.

## Languages
English / French switch in the header (remembered per browser; `?lang=fr` opens in French; first visit follows the browser language).
- Page texts: `assets/js/i18n.js` – French from the client's content document, plus translations of buttons / forms to review.
- Products and categories: French name and description come from the product master (`name_fr`, `short_desc_fr`).
- Orders remember the language; the customer's confirmation e-mail is sent in that language. Admin stays in English.

## Folder layout

| Path | What it is |
|---|---|
| `index.html` | Landing page (Home, About, Products, Contact) and the **Order Online** shop (`#/shop`), all in one page with hash routing |
| `assets/css/styles.css` | All styles (brand colours taken from the packaging) |
| `assets/js/app.js` | Shop logic: catalogue, search/filter/sort, cart, GST/QST, delivery fee, minimum order, checkout, enquiry form, EN/FR |
| `assets/js/i18n.js` | French page texts and shop messages (EN + FR) |
| `assets/img/` | Product images from the Drive folder (resized), plus a samosa placeholder until a real photo arrives |
| `data/products.js` | Catalogue + store settings used by the front end. **Generated** from the Excel template |
| `database/01_schema.sql` | MySQL 8 schema – database **`Tanjofoods`** (25 tables + `v_storefront_products` view) |
| `database/02_seed_reference.sql` | Categories, Quebec tax rates, sample delivery zone/slots, settings |
| `database/03_seed_products.sql` | Product upserts – **generated** from the Excel template |
| `database/migrations/*.sql` | Data changes for existing databases, applied once each by `setup-db` (e.g. 2026-11-11 Frozen Food + 12 new products) |
| `templates/Tanjo_Foods_Product_Template.xlsx` | Template to send to the client for product information |
| `tools/import_products.py` | Reads the returned template → validates → writes `03_seed_products.sql` and `data/products.js` |
| `tools/build_template.py` | Rebuilds the blank/pre-filled template |
| `tools/build_preview.py` | Builds the single-file client preview |
| `preview/Tanjo_Foods_Design_Preview.html` | One self-contained HTML file (images embedded) to e-mail to the client |
| `api/` | Node.js + Express + MySQL API that also serves the website (`npm start`) |
| `mock-pay.html` | TEST-mode payment page (stands in for Stripe/Square) |
| `admin.html` | Admin: orders, products (add/edit, photos, price history, Excel upload), reports, enquiries, users |
| `product-images/` | Product photos named by SKU (`TF-SN-001.jpg`, `TF-SN-001_2.jpg` …) – picked up automatically |

## Run locally – full end-to-end test (API + database)
Needs Node.js 18+ and a local MySQL 8 (or MariaDB 10.6+).

```
cd api
npm install
copy .env.example .env        (then edit: DB_ADMIN_PASSWORD = your MySQL root password)
npm run setup-db
npm start
```
Open **http://localhost:4100** – the site detects the API and switches to live mode
(ribbon: "TEST MODE – orders are saved, but card payments are simulated").

`npm run setup-db` is safe to re-run. It creates database `Tanjofoods` only if missing
(existing tables and data are kept), and creates a dedicated MySQL login `tanjo_app`
that can access **only** `Tanjofoods` – your other databases are untouched and invisible to the app.
Products load only when the products table is empty (`npm run setup-db -- --reseed-products` to reload).

| URL | |
|---|---|
| http://localhost:4100/#/shop | Shop |
| http://localhost:4100/admin.html | Admin – first login is `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `api/.env` (default `admin@tanjofoods.com` / `Tanjo@2026`) |
| `api/outbox/` | Order / enquiry e-mails are written here as .html until SMTP is set in `.env` |

### Test script
1. Shop → add items (≥ $25) → Checkout → Delivery, postal code in Montreal (e.g. `H3B 1K9`) → **Credit / debit card** → Place order.
2. Mock payment page → try **Simulate a declined card**, then **Pay** → you return to the order confirmation.
3. Place a second order: **Pickup** + **Pay at pickup** (no payment page).
4. Contact form → send an enquiry.
5. Admin → see both orders, open one, move it Confirmed → Preparing → Ready → Completed (history shows who did it); check Payments; Enquiries tab.
6. Admin → Products: edit a price with today's date (immediate) and with a future date (scheduled); upload a photo; add a product; Upload Excel (preview → apply).
7. Copy a photo named e.g. `TF-SN-001.jpg` into `product-images` → it shows on the shop within 30 s (or click *Scan photo folder*).
8. Admin → Users: add a second user, sign in as them, change an order status → Reports → Activity log shows their name.
9. Admin → Reports: Orders (date range + status), Sales & tax, Product sales, Customers, Price history, Activity – each downloads as CSV for Excel.
10. Negative checks: postal code outside Montreal (e.g. `M5V 2T6`) → "we don't deliver"; under $25 → checkout disabled; Mango Lassi → "Notify me".
11. Check the rows in MySQL: `orders`, `order_items`, `order_status_history`, `payments`, `customers`, `customer_addresses`, `enquiries`.

### Design-only mode (no API)
Opening `index.html` directly (or `python -m http.server`) runs in demo mode – nothing is saved.

## Admin features
- **Users** – Admin › Users: add users (name, e-mail, temporary password), rename, reset password, deactivate. No roles: everyone can do everything,
  but every sign-in and change is recorded with the user's name (order history, price history, Reports › Activity log).
- **Products** – add or edit every field (English/French text, pack, tax, status, stock, 'Popular' badge). SKU is fixed once created (photos are named by it).
  Duplicate product names are blocked.
- **Prices** – changing a price keeps the old one in `product_price_history` with its cut-off date. Pick a future *effective from* date to
  schedule a price: the current price stays until that date, then switches automatically. Scheduled prices can be cancelled.
- **Photos** – upload in the product page, or copy files named by SKU into `product-images` (see `_README.txt` there).
  The first photo (`TF-SN-001.jpg`, else the lowest `_n`) is the main photo; *Make main* overrides. Deleted photos go to `product-images/_deleted`.
- **Excel upload** – Products › Upload Excel with the client template: preview shows new / changed / unchanged / error rows before saving.
  Blank cells never wipe data; rows without SKU are matched by product name, otherwise added with the next SKU.
- **Reports** (all exportable to CSV/Excel, printable):
  Orders (date range by order or delivery date + one/all statuses, payment, delivery/pickup) ·
  Sales & tax (by day/week/month, GST & QST collected, card vs pay-on-delivery) · Product sales (best sellers, price range sold at) ·
  Customers (orders, spend, segment New/Returning/Regular/Loyal, lapsing, illustrative points = 1 per $1 – base for a loyalty programme) ·
  Price history (every price with from/to dates and who changed it) · Activity log (who did what, when).

## Product data workflow
1. Send `templates/Tanjo_Foods_Product_Template.xlsx` to the client. Yellow cells are our sample values to confirm.
2. Client returns it with photos named by SKU (e.g. `TF-SN-001_1.jpg`). Put photos in `assets/img/`.
3. `pip install openpyxl` then `python tools/import_products.py <returned-file>.xlsx`
   – errors are listed by Excel row; fix and re-run (`--force` skips bad rows).
4. Load `database/03_seed_products.sql`, then `python tools/build_preview.py` to refresh the preview.
5. When products are final, set `sampleData: false` in `data/products.js` to remove the "sample values" ribbon.

## API (api/routes)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | DB check |
| GET | `/api/config` | Min order, delivery fee, free-delivery threshold, taxes, time slots (from DB) |
| GET | `/api/products` | Catalogue from `v_storefront_products` |
| POST | `/api/orders` | Re-prices every line from the DB, checks zone/postal code, min order, max qty, stock, date; creates order + items + customer; returns `order_no`, `token`, and `payment_url` for card |
| GET | `/api/orders/:no?t=token` | Customer's own order (token from the order response / e-mail link) |
| POST | `/api/payments/mock/:no` | TEST mode only (`PAYMENT_MODE=MOCK`): `{t, outcome:"success"\|"decline"}` → `payments` row, order PAID + CONFIRMED, e-mails |
| POST | `/api/enquiries` | Contact form |
| POST | `/api/notify` | "Notify me" for coming-soon products |
| POST | `/api/admin/login` | E-mail + password → session token (12 h, sliding). All other admin calls send `Authorization: Bearer <token>` |
| … | `/api/admin/orders`, `/orders/:no/status` | Orders; status changes record the user (cancel puts tracked stock back) |
| … | `/api/admin/products`, `/products/:id`, `/products/:id/images`, `/images/scan` | Add / edit products, stock, photos; price changes with effective date |
| … | `/api/admin/import`, `/import/:batch/apply`, `/products/template` | Excel upload: validate + preview, then apply |
| GET | `/api/admin/reports/:name?…&format=csv` | `orders`, `sales`, `products`, `customers`, `prices`, `activity` |
| … | `/api/admin/users`, `/me/password`, `/enquiries` | Users (add, rename, reset password, deactivate), own password, enquiries |

**Payment gateway later:** replace `payment_url` in `POST /api/orders` with the gateway's checkout URL
(e.g. Stripe Checkout) and add its webhook to mark the order PAID – the `payments` table already fits.

**Before going live:** set a strong `DB_PASSWORD`, set `PAYMENT_MODE` to the real gateway, configure SMTP,
run behind HTTPS, and change the first admin password.

## Draft products
A product without a price (e.g. the 12 frozen products added 2026-11-11) is saved as **Draft** and never shown in the shop.
To publish it: Admin → Products → open it → enter price and pack size → Status *Active* → Save (or upload the Excel template).

## Open points for the client
- Retail prices, pack sizes, ingredients/allergens, barcodes (template).
- GST/QST status per product – confirm with their accountant (sauces/frozen samosas set as zero-rated, snacks/drinks taxable).
- Samosa product photo; Mango Lassi launch date.
- Delivery coverage (postal codes), fees, minimum order, time slots; pickup address and phone number.
- Payment provider (Stripe / Square / Moneris).
- French version of the site – Quebec's Charter of the French Language applies to commercial websites. The schema and template already hold French names/descriptions.
