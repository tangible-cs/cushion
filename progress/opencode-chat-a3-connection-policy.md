# A3 - Connection Policy

- Status: [x] Complete
- Owner: Subagent
- Scope: Define ports, auth, CORS, reconnection, and health checks.
- Inputs: `opencode/packages/opencode/src/server/server.ts`, `opencode/packages/opencode/src/server/routes/global.ts`, `opencode/packages/sdk/js/src/v2/gen/core/serverSentEvents.gen.ts`
- Outputs: Connection policy checklist and risks (no code).
- Notes:
  - Default base URL resolves to http://localhost:4096. If server is started with port 0, it will try 4096 first, then any available port.
  - The server uses HTTP basic auth only when OPENCODE_SERVER_PASSWORD is set; username defaults to opencode when OPENCODE_SERVER_USERNAME is not set.
  - CORS allows http://localhost:* and http://127.0.0.1:*, tauri origins, and https://*.opencode.ai; an explicit whitelist can be supplied when starting the server.
  - Directory scoping is required for correct workspace mapping and is provided via x-opencode-directory header or directory query parameter.
  - Global health endpoint is /global/health; use it for initial connectivity checks.
  - Global SSE endpoint is /global/event and emits server.connected on connect and server.heartbeat every 30s.
  - SDK SSE client supports Last-Event-ID, onSseEvent/onSseError hooks, and exponential backoff. Default retry starts at 3000ms and caps at 30000ms unless overridden.
- Decisions:
  - Connection policy: use a client-only OpenCode SDK instance with baseUrl set to the server URL and x-opencode-directory set per workspace.
  - Health check: call /global/health on startup and re-check after SSE disconnects.
  - SSE reconnection: enable retry with exponential backoff and surface user-visible “reconnecting” state.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
