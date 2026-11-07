# Table reservations (branch `reservations`, built on `uat`)

Real-time table booking for the Montreal dining room. Public page, staff screens and e-mails, in the same app and database.

## Rules
- **Sessions with start times** (defaults: Lunch 11:00-14:30 and Dinner 17:00-21:30, a start time every 30 minutes, so the
  last guests sit down by 15:00 / 22:00). First start, last start and interval (15/30/45/60) are set per session in
  Reservation setup → Sessions & times.
- **Table time 90 minutes** (setting): a 19:00 booking holds its tables until 20:30; the tables are free again for a later start.
  Stored per 15-minute step in `res_booking_slot` (primary key = table + date + step), so a table can never be double booked.
- **Reservable chairs at any time: 40** (rest for walk-ins). Counted every 15 minutes over the booking's table time: chairs of
  the booked tables (3 guests on a 4-table use 4), staff blocks, and guests of bookings still waiting for tables.
- **A-series booths cannot be joined** (table setting "Can be joined" = No; A1-A6 seeded so). A booth is booked alone, up to
  its 4 chairs. Groups above 4 are offered B and C tables only.
- **Choosing tables is optional online**: the guest can book a time without picking tables (if the time has room under the 40);
  the booking shows **Tables to allocate** for staff, who allocate tables and the guest is e-mailed the table numbers.
  "Choose the best table for me" picks tables only when the guest clicks it.
- Groups above 12 (setting) are asked to call. Every booking change locks the `res_settings` row (no race on the last seats).
- Customers can cancel online until 60 minutes before (setting); staff can change, move or cancel any time.

## Customer side (public, no login) - `/v1/reserve`
| Page | What it does |
|---|---|
| `/reserve` | Date → guests → time grid (free / few seats left / full / closed) → floor plan (guest taps tables, or "Choose the best table for me") → details → Reserve. Refreshes every 30 s. |
| `/reserve/booking/<code>` | Confirmation; the link in the e-mail opens it to view or cancel. |

Later, on thanjaigroup.com, link the Reservation menu to `https://pm.thanjaicaterers.com/v1/reserve`.

## Staff side - menu **Reservations** (Role Master screens RES_BOOKINGS, RES_REPORTS, RES_SETUP)
| Screen | What it does |
|---|---|
| Floor plan & bookings | Date + session tabs, then a chip per start time with reserved/40; the floor plan shows the tables taken at that time (with names). **Tables to allocate**: bookings without tables are listed in orange - *Allocate tables* → click free tables → *Allocate & e-mail guest* (the guest gets a "Your table" e-mail with the table numbers). Click free tables → **Book** (phone / walk-up) or **Block** (staff hold, counts in the 40). Booking menu: Arrived, No-show, Change (date / time / tables / details), Cancel (optional e-mail). Search by name / phone / e-mail / number. |
| Reports & print | **Reservation status**: per session a by-time table (reserved / can still book / walk-ins / arriving) and a **table timeline** (who holds which table when). **Bookings by customer**: who, guests, which tables, phone, request. Print or PDF (A4 landscape, for the board). |
| Reservation setup | Limits & contact (40, max online group, days ahead, cut-offs, restaurant e-mail, guest notes, pause online booking), sessions (first / last start, interval, days), table time, tables (chairs, can be joined, position on plan, online yes/no, in use), closed dates (whole day or one seating). |

The migration gives these screens to the Operations Manager role (all three) and the Branch role (bookings + reports).
Adjust in Master → Role.

## Floor plan
Seeded from the hand-drawn plan: A1–A6 (booths, top wall), B1–B4, B6–B11 (no B5), C1–C3. All 4 chairs except **B7 and B11 (2)**
= **19 tables, 72 chairs**. The drawing says 70 - change the table that is really a 2-seater in Reservation setup → Tables
(chairs, position, size are all editable there).

## E-mails
On every booking: confirmation to the customer (with "View or cancel" link) + copy to the restaurant e-mail
(`thanjairestaurant@gmail.com`, editable in setup). On cancellation: customer, and the restaurant when the customer cancelled.
Staff bookings e-mail only if an e-mail is entered and the box is ticked. Allocating tables to a request e-mails the guest the table numbers. Requests without tables are flagged "TABLES TO ALLOCATE" in the restaurant copy.

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
`res_closure`, `res_booking`, plus default settings, seatings, the 19 tables and role screens. Migration `012_reservation_slots`:
session start/end/interval, `res_table.joinable` (A1-A6 = N), `res_booking.start_time / duration_min`, `res_booking_slot`
(replaces `res_booking_table`; existing bookings are converted), old fixed seatings become the Lunch / Dinner sessions.
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
