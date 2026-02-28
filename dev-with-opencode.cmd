@echo off
setlocal EnableExtensions EnableDelayedExpansion

set COORDINATOR_PORT=3001
set FRONTEND_PORT=3000
set OPENCODE_PORT=4097

set RUN_COORDINATOR=1
set RUN_FRONTEND=1
set RUN_OPENCODE=1

call :kill_processes_on_port %COORDINATOR_PORT%
call :wait_for_port_release %COORDINATOR_PORT% 10
if errorlevel 1 (
  echo Coordinator port %COORDINATOR_PORT% is still busy. Aborting startup.
  exit /b 1
)

call :is_port_listening %FRONTEND_PORT%
if not errorlevel 1 (
  call :is_http_healthy %FRONTEND_PORT%
  if errorlevel 1 (
    echo Frontend on port %FRONTEND_PORT% is listening but unresponsive. Restarting frontend.
    call :kill_processes_on_port %FRONTEND_PORT%
    call :wait_for_port_release %FRONTEND_PORT% 10
    if errorlevel 1 (
      echo Frontend port %FRONTEND_PORT% is still busy. Aborting startup.
      exit /b 1
    )
  ) else (
    echo Frontend already listening on port %FRONTEND_PORT% and is healthy. Reusing existing server.
    set RUN_FRONTEND=0
  )
)

call :is_port_listening %OPENCODE_PORT%
if not errorlevel 1 (
  echo OpenCode already listening on port %OPENCODE_PORT%. Reusing existing server.
  set RUN_OPENCODE=0
)

if "%RUN_OPENCODE%"=="1" (
  where opencode >nul 2>nul
  if errorlevel 1 (
    echo OpenCode not found. Installing with npm...
    call npm install -g opencode
    if errorlevel 1 exit /b %errorlevel%
  )
)

set RUN_MASK=%RUN_COORDINATOR%%RUN_FRONTEND%%RUN_OPENCODE%
echo Startup plan: coordinator=%RUN_COORDINATOR% frontend=%RUN_FRONTEND% opencode=%RUN_OPENCODE%

if "%RUN_MASK%"=="000" (
  echo Coordinator, frontend, and OpenCode are already running. Nothing to start.
  exit /b 0
)

if "%RUN_MASK%"=="100" (
  bun run --filter coordinator dev
  exit /b %errorlevel%
)

if "%RUN_MASK%"=="010" (
  bun run --filter frontend dev
  exit /b %errorlevel%
)

if "%RUN_MASK%"=="001" (
  opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000
  exit /b %errorlevel%
)

if "%RUN_MASK%"=="110" (
  bun run concurrently -k --names coordinator,frontend --prefix-colors blue,green "bun run --filter coordinator dev" "bun run --filter frontend dev"
  exit /b %errorlevel%
)

if "%RUN_MASK%"=="101" (
  bun run concurrently -k --names coordinator,opencode --prefix-colors blue,magenta "bun run --filter coordinator dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
  exit /b %errorlevel%
)

if "%RUN_MASK%"=="011" (
  bun run concurrently -k --names frontend,opencode --prefix-colors green,magenta "bun run --filter frontend dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
  exit /b %errorlevel%
)

bun run concurrently -k --names coordinator,frontend,opencode --prefix-colors blue,green,magenta "bun run --filter coordinator dev" "bun run --filter frontend dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
exit /b %errorlevel%

:kill_processes_on_port
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /I /C:":%~1 .*LISTENING" /C:":%~1 .*ESCUCHANDO"') do (
  if not "%%P"=="0" (
    echo Stopping process on port %~1 PID %%P...
    taskkill /PID %%P /T /F >nul 2>nul
  )
)
exit /b 0

:is_http_healthy
powershell -NoProfile -Command "try { $request = [System.Net.WebRequest]::Create('http://localhost:%~1/'); $request.Timeout = 3000; $response = $request.GetResponse(); $response.Close(); exit 0 } catch [System.Net.WebException] { if ($_.Exception.Response -ne $null) { $_.Exception.Response.Close(); exit 0 } exit 1 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:wait_for_port_release
setlocal EnableDelayedExpansion
set /a "TRIES=%~2"
if "%~2"=="" set /a "TRIES=10"

:wait_for_port_release_loop
call :is_port_listening %~1
if errorlevel 1 (
  endlocal
  exit /b 0
)

if !TRIES! LEQ 0 (
  endlocal
  exit /b 1
)

set /a "TRIES-=1"
timeout /t 1 /nobreak >nul
goto wait_for_port_release_loop

:is_port_listening
netstat -ano | findstr /R /I /C:":%~1 .*LISTENING" /C:":%~1 .*ESCUCHANDO" >nul
exit /b %errorlevel%
