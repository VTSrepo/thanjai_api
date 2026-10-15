@echo off
REM ============================================================
REM  Thanjai - SUBSCRIBER MODULE preview (runs beside your normal app)
REM  Port 4003, database thanjai_sub (a copy of thanjai_restaurant made on first run).
REM  Your normal start-local.bat (port 4002, thanjai_restaurant) is not touched.
REM ============================================================
setlocal
cd /d "%~dp0"

set HOST_PORT=4003
set ENV=dev
set WRITE_DB_SRV_HOST=localhost
set WRITE_DB_PORT=3306
set WRITE_DB_USER=root
set WRITE_DB_PASSWORD=root
set SOURCE_DB=thanjai_restaurant
set WRITE_DB_DATABASE=thanjai_sub
REM No Stripe key = TEST MODE (no card is charged)
set STRIPE_SECRET_KEY=
set CORS_ORIGINS=http://localhost:4003

echo Unpacking the screens...
if exist "client\build" rmdir /s /q "client\build"
powershell -NoProfile -Command "Expand-Archive -Path client-build.zip -DestinationPath client -Force" || goto :end

echo.
echo [1/4] Installing packages...
call npm install --no-audit --no-fund || goto :end

echo.
echo [2/4] Preparing database %WRITE_DB_DATABASE% ...
node scripts\prepare-db.js || goto :end

echo.
echo [3/4] Applying database migrations (adds the subscription tables)...
node migrations\run.js || goto :end

echo.
echo [4/4] Starting on port %HOST_PORT%...
echo   Staff app      : http://localhost:%HOST_PORT%/v1/      (same logins as your local app)
echo   Customer shop  : http://localhost:%HOST_PORT%/v1/meals
echo   Press Ctrl+C to stop.
echo.
node index.js

:end
echo.
pause
endlocal
