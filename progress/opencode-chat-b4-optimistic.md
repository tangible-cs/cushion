# B4 - Optimistic Messaging

- Status: [x] Complete
- Owner: Subagent
- Scope: Specify optimistic UI flow and rollback behavior.
- Inputs: `opencode/packages/app/src/components/prompt-input.tsx`
- Outputs: Event sequence and failure handling (no code).
- Notes:
  - Optimistic flow creates a new message ID and assembles parts before sending.
  - Request parts include: user text, file attachment parts, context parts (including synthetic text from comments), agent parts, and image parts.
  - An optimistic message (role user, time.created, agent, model) is inserted into the message list with its optimistic parts.
  - Optimistic insert is written into the current workspace store; if the session directory differs from the project directory, it writes into the global sync child store for that directory.
  - Comment-based context items are removed from prompt context immediately after submission to avoid duplicate re-send.
  - If the worktree is pending, the UI waits for readiness with a timeout; during wait, session status is set to busy and the optimistic message is removed if the wait fails or is aborted.
  - Failure paths (prompt send error, worktree timeout, abort) restore: session status idle, prompt context comments, and input content; the optimistic message is removed.
  - Successful send relies on server events to replace optimistic state with real message updates.
- Decisions:
  - Adopt the same optimistic insert + rollback model in Cushion, including comment context removal and restoration on failure.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
