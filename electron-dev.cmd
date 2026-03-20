@echo off
setlocal EnableExtensions EnableDelayedExpansion

set OPENCODE_PORT=4097
set RUN_OPENCODE=1

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

echo Building types and coordinator for Electron...
call bun run --filter @cushion/types build
if errorlevel 1 exit /b %errorlevel%
call bun run --filter coordinator build
if errorlevel 1 exit /b %errorlevel%

if "%RUN_OPENCODE%"=="1" (
  echo Starting Electron + OpenCode...
  bun run concurrently -k --names electron,opencode --prefix-colors cyan,magenta "bun run --filter electron-app dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
) else (
  echo Starting Electron...
  bun run --filter electron-app dev
)
exit /b %errorlevel%

:is_port_listening
netstat -ano | findstr /R /I /C:":%~1 .*LISTENING" /C:":%~1 .*ESCUCHANDO" >nul
exit /b %errorlevel%
