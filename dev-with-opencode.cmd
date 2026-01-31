@echo off
setlocal
set OPENCODE_PORT=4097
pnpm exec concurrently --names cushion,opencode --prefix-colors blue,magenta "pnpm dev" "opencode serve --port %OPENCODE_PORT%"
