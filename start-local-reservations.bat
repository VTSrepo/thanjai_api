@echo off
REM ============================================================
REM  Thanjai - TABLE RESERVATIONS preview (runs beside your normal app)
REM  Port 4004, database thanjai_res (a copy of thanjai_restaurant made on first run).
REM  Your normal app (4002) and the subscriber preview (4003) are not touched.
REM ============================================================
setlocal
cd /d "%~dp0"

set HOST_PORT=4004
set ENV=dev
set WRITE_DB_SRV_HOST=localhost
set WRITE_DB_PORT=3306
set WRITE_DB_USER=root
set WRITE_DB_PASSWORD=root
set SOURCE_DB=thanjai_restaurant
set WRITE_DB_DATABASE=thanjai_res
set STRIPE_SECRET_KEY=
set CORS_ORIGINS=http://localhost:4004
set PUBLIC_APP_URL=http://localhost:4004/v1

REM ---- E-mail (optional). Leave SMTP_HOST empty = e-mails are only written to this window. ----
REM Gmail: needs an App password for thanjairestaurant@gmail.com (see docs\RESERVATIONS.md)
set SMTP_HOST=
set SMTP_PORT=465
set SMTP_USER=thanjairestaurant@gmail.com
set SMTP_PASS=
set MAIL_FROM=Thanjai Restaurant ^<thanjairestaurant@gmail.com^>

echo.
echo [1/4] Installing packages...
call npm install --no-audit --no-fund || goto :end

echo.
echo [2/4] Preparing database %WRITE_DB_DATABASE% ...
node scripts\prepare-db.js || goto :end

echo.
echo [3/4] Applying database migrations (adds the reservation tables)...
node migrations\run.js || goto :end

echo.
echo [4/4] Starting on port %HOST_PORT%...
echo   Staff app     : http://localhost:%HOST_PORT%/v1/        (menu Reservations; same logins as your local app)
echo   Booking page  : http://localhost:%HOST_PORT%/v1/reserve
echo   Press Ctrl+C to stop.
echo.
node index.js

:end
echo.
pause
endlocal
