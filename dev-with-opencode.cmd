@echo off
setlocal
set OPENCODE_PORT=4097
where opencode >nul 2>nul
if errorlevel 1 (
  echo OpenCode not found. Installing with npm...
  call npm install -g opencode
)
bun run concurrently --names cushion,opencode --prefix-colors blue,magenta "bun run dev" "opencode serve --port %OPENCODE_PORT% --cors http://localhost:3000"
