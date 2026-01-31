# A2 - SDK v2 Browser Validation

- Status: [x] Complete
- Owner: Subagent
- Scope: Confirm SDK v2 browser usage, headers, and transport.
- Inputs: `opencode/packages/sdk/js/src/v2/client.ts`, `opencode/packages/sdk/js/src/v2/gen/client/client.gen.ts`, `opencode/packages/sdk/js/src/v2/gen/client/types.gen.ts`
- Outputs: Browser constraints, required headers, compatibility notes (no code).
- Notes:
  - SDK v2 is built on fetch and the generated client; browser usage is expected.
  - If no fetch is provided, the SDK injects a custom fetch and disables request timeout by setting request timeout to false.
  - Directory selection is passed via header x-opencode-directory; non-ASCII paths are URL-encoded before header injection.
  - Base URL is configurable via baseUrl in the client config. Default is the generated client default if not provided.
  - SSE support is provided by a generated SSE client with onSseEvent/onSseError hooks and retry settings.
  - Response parsing defaults to auto based on content-type; responseStyle defaults to returning fields (data + request/response).
  - throwOnError defaults to false; callers should decide whether to enable it for UI flows.
  - Types warn that the fetch client is not ideal for Next.js server-side usage; use on the client side in Cushion (which is a client UI).
- Decisions:
  - Use the SDK in the browser with a client-only wrapper and explicit baseUrl + directory header.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
