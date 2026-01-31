# G1 - Implementation Task Breakdown (Non-Code)

- Status: [x] Complete
- Owner: Subagent
- Scope: Convert sessions A-F into a concrete implementation task list for Cushion (no code, no snippets).
- Inputs: Session specs A-F in `progress/`
- Outputs: Ordered task list with file targets and dependencies.
- Notes:
  - Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
  - Focus on task sequencing, ownership boundaries, and integration points.

## Implementation Tasks

1) SDK + Connection Layer
   - Files: `apps/frontend/lib/opencode-client.ts`, `apps/frontend/lib/shared-opencode-client.ts` (new)
   - Define a client-only factory that takes baseUrl + workspace directory and exposes a stable instance.
   - Add SSE subscription lifecycle (connect/disconnect/retry) and surface connection status to the store.
   - Dependency: needs Session A outputs (connection policy + server map).

2) Chat Store (Zustand)
   - Files: `apps/frontend/stores/chatStore.ts` (new)
   - Implement state slices: connection, sessions, messages, parts, prompt, context, UI flags.
   - Implement reducers for message/part/session events and history paging metadata.
   - Implement optimistic message insert/remove per B4.
   - Dependency: needs Session B outputs (types + store map + persistence).

3) Chat Sidebar Shell
   - Files: `apps/frontend/app/page.tsx`, `apps/frontend/components/chat/ChatSidebar.tsx` (new)
   - Add a right-panel mode state: none | backlinks | chat; keep width stable.
   - Add Chat toggle next to Backlinks; wire FileBrowser Intelligence button to open Chat.
   - Dependency: needs Session E1 output.

4) Prompt Input (React)
   - Files: `apps/frontend/components/chat/PromptInput.tsx` (new)
   - Implement contenteditable prompt UI with pills, attachments, and history navigation.
   - Add slash/@ popovers, shell mode, and submission pipeline.
   - Dependency: needs Session C outputs (behavior + UI spec + serialization).

5) Message List + Parts
   - Files: `apps/frontend/components/chat/MessageList.tsx`, `apps/frontend/components/chat/MessageItem.tsx`, `apps/frontend/components/chat/parts/*` (new)
   - Create message list container with auto-scroll and backfill strategy.
   - Render user messages with attachments + highlights.
   - Render assistant parts (text, tool, file, reasoning) via a minimal registry.
   - Dependency: needs Session D outputs.

6) Cushion Integration
   - Files: `apps/frontend/components/editor/CodeEditor.tsx`, `apps/frontend/components/editor/EditorPanel.tsx`, `apps/frontend/components/workspace/FileTreeItemActions.tsx`
   - Add selection capture and “Ask AI about selection” entry point.
   - Add file context menu action “Ask AI about this file”.
   - Ensure chat context items include file paths + selections.
   - Dependency: needs Session E2/E3 outputs.

7) Persistence + Layout
   - Files: `apps/frontend/stores/chatStore.ts`, `apps/frontend/app/page.tsx`
   - Persist prompt/context per workspace/session and minimal UI state.
   - Add pruning to prevent localStorage overuse.
   - Dependency: needs Session B3 output.

8) Validation
   - Run manual test matrix from F1.
   - Verify error recovery flows from F2.
   - Spot-check performance guardrails from F3.
