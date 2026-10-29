# Table reservations (branch `reservations`, built on `uat`)

Real-time table booking for the Montreal dining room. Public page, staff screens and e-mails, in the same app and database.

## Rules
- **Fixed seatings** (defaults: Lunch 11:30, 13:00 · Dinner 17:30, 19:00, 20:30). Each seating is booked separately.
- **Reservable chairs per seating: 40** (of the room's chairs; the rest are for walk-ins). The limit counts the **chairs of the
  booked tables** (3 guests on a 4-table use 4) and **staff blocks** too. At 40, that seating closes online and staff
  cannot add more either. Change the number in Reservation setup.
- A booking can hold **several tables** (most tables have 4 chairs); staff push them together. Online, every chosen table must be
  needed (no spare tables) and groups above 12 (setting) are asked to call.
- **No double booking**: one row per table per seating in `res_booking_table` (primary key), and every booking change locks the
  `res_settings` row, so two people can never both take the last seats or the same table (tested with simultaneous bookings).
- Customers can cancel online until 60 minutes before (setting); staff can change, move or cancel any time.

## Customer side (public, no login) - `/v1/reserve`
| Page | What it does |
|---|---|
| `/reserve` | Date → guests → time grid (free / few seats left / full / closed) → floor plan (choose tables; best tables pre-picked) → details → Reserve. Refreshes every 30 s. |
| `/reserve/booking/<code>` | Confirmation; the link in the e-mail opens it to view or cancel. |

Later, on thanjaigroup.com, link the Reservation menu to `https://pm.thanjaicaterers.com/v1/reserve`.

## Staff side - menu **Reservations** (Role Master screens RES_BOOKINGS, RES_REPORTS, RES_SETUP)
| Screen | What it does |
|---|---|
| Floor plan & bookings | Date + seating tabs with reserved/40, walk-in chairs, guests. Floor plan with names. Click free tables → **Book** (phone / walk-up) or **Block** (staff hold, counts in the 40). Booking menu: Arrived, No-show, Change (date / time / tables / details), Cancel (optional e-mail). Search by name / phone / e-mail / number. |
| Reports & print | **Reservation status**: summary of every seating, then per seating the floor plan with names and every table's status. **Bookings by customer**: who, guests, which tables, phone, request. Print or PDF (A4 landscape, for the board). |
| Reservation setup | Limits & contact (40, max online group, days ahead, cut-offs, restaurant e-mail, guest notes, pause online booking), seatings (time, days), tables (chairs, position on plan, online yes/no, in use), closed dates (whole day or one seating). |

The migration gives these screens to the Operations Manager role (all three) and the Branch role (bookings + reports).
Adjust in Master → Role.

## Floor plan
Seeded from the hand-drawn plan: A1–A6 (booths, top wall), B1–B4, B6–B11 (no B5), C1–C3. All 4 chairs except **B7 and B11 (2)**
= **19 tables, 72 chairs**. The drawing says 70 - change the table that is really a 2-seater in Reservation setup → Tables
(chairs, position, size are all editable there).

## E-mails
On every booking: confirmation to the customer (with "View or cancel" link) + copy to the restaurant e-mail
(`thanjairestaurant@gmail.com`, editable in setup). On cancellation: customer, and the restaurant when the customer cancelled.
Staff bookings e-mail only if an e-mail is entered and the box is ticked.

Settings in `.env` (server). Without `SMTP_HOST` nothing is sent - bookings still work and each e-mail is written to the server log.

**Gmail (thanjairestaurant@gmail.com):** turn on 2-Step Verification for that account, then Google Account → Security →
App passwords → create one ("Thanjai app"), and use the 16 letters as `SMTP_PASS`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=thanjairestaurant@gmail.com
SMTP_PASS=abcdefghijklmnop
MAIL_FROM=Thanjai Restaurant <thanjairestaurant@gmail.com>
PUBLIC_APP_URL=https://pm.thanjaicaterers.com/v1
```
(Gmail allows about 500 messages a day - plenty for reservations.)

## Database
Migration `011_reservations` (in `migrations/run.js`, safe to run again): `res_settings`, `res_seating`, `res_table`,
`res_closure`, `res_booking`, `res_booking_table`, plus default settings, seatings, the 19 tables and role screens.
Booking numbers `RS000001…` use `vts_seq_generator` (type `RESV`).

## API
Public: `GET /rsv/info`, `GET /rsv/availability?date=`, `POST /rsv/book`, `GET /rsv/booking/:code`, `POST /rsv/booking/:code/cancel`
(the booking form has a hidden spam trap and allows 6 attempts per 15 minutes per address).
Staff: `GET /res/day/:org?date=`, `GET /res/search/:org?q=`, `POST /res/booking`, `/res/booking/update`, `/res/booking/status`,
`GET /res/setup/:org`, `POST /res/settings`, `/res/seating`, `/res/table`, `/res/closure`, `/res/closure/delete`.

## Test locally (Windows)
`start-local-reservations.bat` (next to index.js): port **4004**, database **thanjai_res** (a copy of thanjai_restaurant made on
first run; your other local databases are not touched). Staff app `http://localhost:4004/v1/`, booking page
`http://localhost:4004/v1/reserve`. Put SMTP settings in that file to try real e-mails.

## Deploy to pm.thanjaicaterers.com (after local testing)
```bash
cd ~/backups && TS=$(date +%Y%m%d_%H%M) && sudo mysqldump --single-transaction --routines --triggers thanjai_restaurant > thanjai_before_reservations_$TS.sql && chmod 600 *.sql
cd ~/code/thanjai_api && git fetch origin && git checkout reservations && git pull
# add the SMTP_* and PUBLIC_APP_URL lines above to .env
npm ci --omit=dev && node migrations/run.js && sudo systemctl restart TR && sleep 4 && \
curl -s -o /dev/null -w "booking page: %{http_code}\n" http://localhost:4002/v1/reserve && \
curl -s http://localhost:4002/v1/rsv/info | head -c 120; echo
```
Expected migration line: `011_reservations: defaults created (tables, seatings, settings, role screens)`.
Then Ctrl+F5 in the browser, open Reservations → Reservation setup and check the tables and the e-mail warning is gone.

Rollback: `git checkout uat && npm ci --omit=dev && sudo systemctl restart TR` (the new tables can stay; nothing else uses them).

## UI change outside reservations
`src/utilities/service.js`: the web build now calls the server it was loaded from (same address as before on
pm.thanjaicaterers.com), so one build works in production and in a local test. Mobile (`build:mobile`) still uses
`REACT_APP_API_URL_PROD`.
