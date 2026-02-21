@echo off
setlocal
set OPENCODE_PORT=4097
where opencode >nul 2>nul
if errorlevel 1 (
  echo OpenCode not found. Installing with npm...
  call npm install -g opencode
)
bun run concurrently -k --names coordinator,frontend,opencode --prefix-colors blue,green,magenta "bun run --filter coordinator dev" "bun run --filter frontend dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
