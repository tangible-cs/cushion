# OpenCode AI Chat Sidebar for Cushion

**Goal**: Deliver a fully integrated AI chat **sidebar in Cushion** that works together with the editor, file browser, terminal, backlinks panel, and graph view. The sidebar must feel native and share state with the rest of the workspace UI.

## Non-Negotiable Rules

1. **Copy from OpenCode when it fits perfectly.**
   - Prefer reuse over reimplementation when compatibility is high.
   - Skip code that does not map cleanly to Cushion or React.
2. **No blind copying from OpenCode**.
   - Behavior must be understood and validated before reuse.
3. **This is a Cushion sidebar**.
   - Integration must be designed to coexist with existing panels and shortcuts.

## Architecture Overview (Target)

```
┌─────────────────────────────────────────────────────────────┐
│                        Cushion (Next.js)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ CodeMirror   │  │ File Browser │  │  Chat Sidebar    │  │
│  │   Editor     │  │              │  │  (OpenCode UX)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │ selections       │ files            │ messages   │
│         └──────────────────┴──────────────────┴─────────── │
│                             │                               │
│                       Zustand Stores                        │
└─────────────────────────────┼───────────────────────────────┘
                              │ HTTP + SSE
                       ┌──────▼───────┐
                       │ OpenCode SDK │
                       │   (v2)       │
                       └──────┬───────┘
                              │ REST + SSE
                       ┌──────▼───────┐
                       │ OpenCode     │
                       │ Server       │
                       └──────────────┘
```

## Decisions (Must be recorded before implementation)

- [ ] Use a **separate OpenCode server** (recommended for MVP).
- [ ] Merge OpenCode into Cushion coordinator (single server).
- [ ] Other (document rationale).

## Work Breakdown (Sessions + Subtasks)

Each subtask is assigned to a future subagent. Every subtask has a progress file in `progress/`.

### Session A: Backend + SDK Connectivity

- [ ] A1. Map OpenCode server routes and event flow (global + session SSE).
  - Progress: `progress/opencode-chat-a1-server-map.md`
- [ ] A2. Validate SDK v2 usage in browser and required headers (directory/workspace).
  - Progress: `progress/opencode-chat-a2-sdk-browser.md`
- [ ] A3. Define connection policy (ports, auth, CORS, reconnection, health checks).
  - Progress: `progress/opencode-chat-a3-connection-policy.md`

### Session B: Data Model + State Sync

- [ ] B1. Extract message/part/context schemas and naming from OpenCode.
  - Progress: `progress/opencode-chat-b1-types.md`
- [ ] B2. Map OpenCode sync events to a Zustand reducer plan (no code).
  - Progress: `progress/opencode-chat-b2-store-map.md`
- [ ] B3. Define persistence scope + eviction strategy.
  - Progress: `progress/opencode-chat-b3-persistence.md`
- [ ] B4. Specify optimistic message pipeline and rollback behavior.
  - Progress: `progress/opencode-chat-b4-optimistic.md`

### Session C: Prompt Input (Behavior Spec)

- [ ] C1. Document PromptInput behaviors (mentions, slash commands, history, attachments).
  - Progress: `progress/opencode-chat-c1-prompt-behavior.md`
- [ ] C2. Define Cushion-native UI structure and interaction rules (no code).
  - Progress: `progress/opencode-chat-c2-prompt-ui-spec.md`
- [ ] C3. Define prompt-to-part serialization rules (text/file/tool/agent).
  - Progress: `progress/opencode-chat-c3-parts-serialization.md`

### Session D: Message List + Streaming

- [ ] D1. Define message list layout and interaction model (no code).
  - Progress: `progress/opencode-chat-d1-message-layout.md`
- [ ] D2. Define part rendering rules (text/file/tool/diff/terminal).
  - Progress: `progress/opencode-chat-d2-part-rendering.md`
- [ ] D3. Define streaming update rules and re-render triggers.
  - Progress: `progress/opencode-chat-d3-streaming.md`

### Session E: Cushion Integration (Sidebar Cohesion)

- [ ] E1. Sidebar layout, toggles, and coexistence with backlinks/graph/terminal.
  - Progress: `progress/opencode-chat-e1-sidebar-layout.md`
- [ ] E2. Editor selection to context item mapping (ranges, file paths).
  - Progress: `progress/opencode-chat-e2-editor-selection.md`
- [ ] E3. File browser context hooks (Ask AI, drag/drop, badges).
  - Progress: `progress/opencode-chat-e3-file-browser-context.md`
- [ ] E4. Session routing/tabs and workspace lifecycle behavior.
  - Progress: `progress/opencode-chat-e4-session-lifecycle.md`

### Session F: Validation + Risk

- [ ] F1. Manual test matrix for core flows.
  - Progress: `progress/opencode-chat-f1-manual-tests.md`
- [ ] F2. Error handling and resilience requirements.
  - Progress: `progress/opencode-chat-f2-error-handling.md`
- [ ] F3. Performance guardrails and profiling plan.
  - Progress: `progress/opencode-chat-f3-performance.md`

### Session G: Implementation Task Breakdown (Non-Code)

- [ ] G1. Translate specs into an implementation task list (no code, no snippets).
  - Progress: `progress/opencode-chat-g1-implementation-tasks.md`

## Research Sources (Must be read, summarized, and referenced)

- OpenCode app contexts: `opencode/packages/app/src/context/`
- Prompt input: `opencode/packages/app/src/components/prompt-input.tsx`
- Session page: `opencode/packages/app/src/pages/session.tsx`
- SDK v2 client: `opencode/packages/sdk/js/src/v2/client.ts`
- Server routes: `opencode/packages/opencode/src/server/routes/`
- Cushion editor: `apps/frontend/components/editor/CodeEditor.tsx`
- Cushion layout: `apps/frontend/app/page.tsx`
- Cushion store: `apps/frontend/stores/workspaceStore.ts`

## Success Criteria

- [ ] Chat sidebar is visible and native in Cushion.
- [ ] Sidebar works together with editor, file browser, terminal, backlinks, and graph.
- [ ] Can send and receive messages with streaming parts.
- [ ] Can attach files and selections as context.
- [ ] Session state persists within reasonable storage limits.
- [ ] Error handling is robust and user-visible.
- [ ] Performance is acceptable for large workspaces.

## Progress Files Index

- `progress/opencode-chat-a1-server-map.md`
- `progress/opencode-chat-a2-sdk-browser.md`
- `progress/opencode-chat-a3-connection-policy.md`
- `progress/opencode-chat-b1-types.md`
- `progress/opencode-chat-b2-store-map.md`
- `progress/opencode-chat-b3-persistence.md`
- `progress/opencode-chat-b4-optimistic.md`
- `progress/opencode-chat-c1-prompt-behavior.md`
- `progress/opencode-chat-c2-prompt-ui-spec.md`
- `progress/opencode-chat-c3-parts-serialization.md`
- `progress/opencode-chat-d1-message-layout.md`
- `progress/opencode-chat-d2-part-rendering.md`
- `progress/opencode-chat-d3-streaming.md`
- `progress/opencode-chat-e1-sidebar-layout.md`
- `progress/opencode-chat-e2-editor-selection.md`
- `progress/opencode-chat-e3-file-browser-context.md`
- `progress/opencode-chat-e4-session-lifecycle.md`
- `progress/opencode-chat-f1-manual-tests.md`
- `progress/opencode-chat-f2-error-handling.md`
- `progress/opencode-chat-f3-performance.md`
- `progress/opencode-chat-g1-implementation-tasks.md`
