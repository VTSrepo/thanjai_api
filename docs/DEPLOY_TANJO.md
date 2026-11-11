# Deploy: Tanjo Foods shop at pm.thanjaicaterers.com/v1/tanjo (Nov 2026)

The Tanjo Foods e-commerce site (landing page EN/FR, online ordering, admin) now lives in the **`tanjofoods/`** folder of
thanjai_api and is mounted at **`/v1/tanjo`** by the same `TR` service – like `/v1/meals` and `/v1/reserve`.
(`/v1/shop` is not used because the weekly-meals API already lives under `/v1/shop/...`.)

| | |
|---|---|
| Shop | https://pm.thanjaicaterers.com/v1/tanjo/ |
| Shop admin (own logins) | https://pm.thanjaicaterers.com/v1/tanjo/admin.html |
| Database | **`Tanjofoods`** – separate from `thanjai_restaurant`; MySQL user `tanjo_app` can only see `Tanjofoods` |
| Settings | `TANJO_*` lines in `~/code/thanjai_api/.env` (the shop never reads the restaurant's DB or mail settings) |
| Photos | `~/tanjo-images` (outside the code folder, so a deploy never touches them) |
| Payments | `TANJO_PAYMENT_MODE=MOCK` – test payment page, no card charged |

If the shop cannot start (e.g. its database is missing) only `/v1/tanjo` shows an error – the restaurant app keeps running.

## 1. On your PC – push to GitHub
Run `push-reservations.bat` in the *Reservation Module* folder (branch `reservations`).

## 2. On the VPS (one line at a time)
```
cd ~/code/thanjai_api && git status --short && git fetch origin && git checkout reservations && git pull origin reservations && git log --oneline -1
npm ci --omit=dev
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```
`git status --short` must print nothing before the pull. The last line prints a random password – copy it for the next step.

Add these lines to `~/code/thanjai_api/.env` (`nano .env`, paste at the end, Ctrl+O, Enter, Ctrl+X):
```
TANJO_DB_HOST=localhost
TANJO_DB_NAME=Tanjofoods
TANJO_DB_USER=tanjo_app
TANJO_DB_PASSWORD=<the random password>
TANJO_DB_ADMIN_USER=root
TANJO_DB_ADMIN_SOCKET=/var/run/mysqld/mysqld.sock
TANJO_ADMIN_NAME=Rajesh
TANJO_ADMIN_EMAIL=<your e-mail – first shop-admin login>
TANJO_ADMIN_PASSWORD=<a password for the shop admin>
TANJO_PUBLIC_URL=https://pm.thanjaicaterers.com/v1/tanjo
TANJO_PAYMENT_MODE=MOCK
TANJO_PRODUCT_IMAGE_DIR=/home/thanjai/tanjo-images
```
Then create the photo folder and the database (the `sudo` login works like `sudo mysql` – no root password needed):
```
mkdir -p ~/tanjo-images && cp tanjofoods/product-images/_README.txt ~/tanjo-images/
sudo "$(which node)" tanjofoods/api/scripts/setup-db.js
sudo systemctl restart TR && sleep 4 && sudo systemctl status TR --no-pager | head -5
curl -s http://localhost:4002/v1/tanjo/api/health && echo && curl -s -o /dev/null -w "shop page: %{http_code}\n" http://localhost:4002/v1/tanjo/ && curl -s -o /dev/null -w "meals page: %{http_code}\n" http://localhost:4002/v1/meals
```
Expected from setup-db (first run): `Creating database Tanjofoods`, `Products loaded … 21 products`, `Created first admin login`,
`Created MySQL user 'tanjo_app'…`, `App login OK – shop shows 9 products`. Running it again changes nothing.
Health prints `{"ok":true,"db":"Tanjofoods","payment_mode":"MOCK"}`; both page lines print `200`.

**Photo uploads:** if the site sits behind nginx, uploads above 1 MB need `client_max_body_size 10m;` in the
pm.thanjaicaterers.com server block (`sudo nginx -t && sudo systemctl reload nginx`). Without it larger photos fail with "413".

## 3. Check in the browser
1. https://pm.thanjaicaterers.com/v1/tanjo/ – switch EN / FR at the top; Order Online → add items → checkout → test payment page → confirmation.
2. /v1/tanjo/admin.html – sign in with `TANJO_ADMIN_EMAIL` / `TANJO_ADMIN_PASSWORD`; the order is listed; Products shows the
   12 new frozen products as **Draft / No price** – they appear in the shop once price + pack size are entered and status is Active.
3. /v1/meals and /v1/reserve still work as before.

## E-mail (optional)
Empty `TANJO_SMTP_HOST` = order / enquiry e-mails are saved in `tanjofoods/api/outbox/` (nothing is sent). To send them, add
`TANJO_SMTP_HOST`, `TANJO_SMTP_PORT=465`, `TANJO_SMTP_SECURE=true`, `TANJO_SMTP_USER`, `TANJO_SMTP_PASSWORD` and
`TANJO_MAIL_FROM` (Tanjo Foods' own mailbox once confirmed) and restart TR.

## Later updates
Product data and prices are maintained in the shop admin (Products, Upload Excel). Code updates come with the normal
pull + `npm ci` + restart; run `sudo "$(which node)" tanjofoods/api/scripts/setup-db.js` after each pull – it applies new
shop migrations once and is otherwise a no-op.

## Rollback
```
cd ~/code/thanjai_api && git checkout eb4eaff && npm ci --omit=dev && sudo systemctl restart TR
```
(`eb4eaff` = the version before the shop was added.) The `Tanjofoods` database and `~/tanjo-images` can stay – the restaurant
app does not use them. To remove the shop completely: `sudo mysql -e "DROP DATABASE Tanjofoods; DROP USER 'tanjo_app'@'localhost'; DROP USER 'tanjo_app'@'127.0.0.1';"`
