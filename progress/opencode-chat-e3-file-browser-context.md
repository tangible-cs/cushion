# E3 - File Browser Context Hooks

- Status: [x] Complete
- Owner: Subagent
- Scope: Define file menu actions, drag/drop, context badges.
- Inputs: `apps/frontend/components/workspace/FileBrowser.tsx`, `apps/frontend/components/workspace/FileTreeItemActions.tsx`
- Outputs: Interaction rules and context payloads (no code).
- Notes:
  - FileBrowser already exposes an Intelligence button and supports a context menu per tree item (via FileTreeItemActions + ContextMenu).
  - Context menu items are defined in FileTreeItemActions and can be extended to add “Ask AI about this file”.
  - The existing menu is positioned to the right of the item and already supports separators and icons.
  - File path for context actions is available as node.path and matches workspace-relative paths.
  - No drag/drop integration exists yet for chat; adding drag-to-chat should be treated as a later enhancement.
- Decisions:
  - Add a context menu action “Ask AI about this file” that triggers opening the Chat sidebar and adds a file context item.
  - Use the Intelligence button to open the chat sidebar even when no file is selected.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
