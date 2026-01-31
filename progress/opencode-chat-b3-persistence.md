# B3 - Persistence Scope

- Status: [x] Complete
- Owner: Subagent
- Scope: Decide what to persist and storage limits.
- Inputs: `opencode/packages/app/src/context/prompt.tsx`, `opencode/packages/app/src/context/global-sync.tsx`, `opencode/packages/app/src/context/layout.tsx`, `opencode/packages/app/src/utils/persist.ts`
- Outputs: Persist list, eviction rules, risk notes (no code).
- Notes:
  - Prompt persistence is scoped by workspace and optional session id. Stored fields include prompt parts, cursor position, and context items.
  - Prompt persistence uses a capped in-memory cache of 20 sessions and a keying strategy that de-duplicates context items by path + selection + comment signature.
  - Global Sync persists the project list (sanitized icons) and per-workspace caches for VCS info, project metadata, and icon overrides.
  - Layout persistence stores UI layout state: sidebar width/open state, terminal height/open state, file tree settings, session panel width, and session tabs/view state including scroll snapshots.
  - Layout persistence prunes session view/tab records beyond 50 entries and drops related session-scoped persisted state (prompt/terminal/file-view) when pruning.
  - Scroll persistence is debounced and flushed on page hide/visibility change.
  - Persist utility includes a cache with total size and entry count limits and eviction logic to avoid localStorage quota failures.
- Decisions:
  - For Cushion chat sidebar, persist prompt + context + cursor per workspace/session and minimal UI layout state (sidebar open/width, active session).
  - Use pruning for session-specific UI state to avoid localStorage quota issues.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
