# E4 - Session Lifecycle

- Status: [x] Complete
- Owner: Subagent
- Scope: Session create/close/restore rules for workspace lifecycle.
- Inputs: `opencode/packages/app/src/context/layout.tsx`, `opencode/packages/app/src/components/prompt-input.tsx`, OpenCode sync lifecycle notes
- Outputs: Lifecycle rules and edge cases (no code).
- Notes:
  - Session identity is scoped by directory + session id; UI state is keyed by a sessionKey derived from the directory + session id.
  - New session creation is triggered from the prompt input when no session id exists; it can create or select a worktree, then navigates to the new session route.
  - Worktree selection may change the directory context; a new SDK client is created for that directory and a child sync store is activated for it.
  - Layout persistence stores per-session view state (scroll positions, review tab open state) and per-session tabs (opened tabs + active tab).
  - Session view/tabs are pruned when exceeding a max count to avoid storage bloat; pruning removes related per-session UI state.
  - Session list and status are updated by global SSE events (session.created/updated/deleted and session.status).
- Decisions:
  - For Cushion, key chat session state by workspace directory + session id, and persist only minimal per-session UI state (scroll position, active tab, prompt state).
  - When switching workspaces, initialize a new session context and isolate message history from other workspaces.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
