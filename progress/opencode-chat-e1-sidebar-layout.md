# E1 - Sidebar Layout and Cohesion

- Status: [x] Complete
- Owner: Subagent
- Scope: Sidebar placement and coexistence with other panels.
- Inputs: `apps/frontend/app/page.tsx`
- Outputs: Layout plan and toggle behavior (no code).
- Notes:
  - Current right panel is a fixed-width backlinks sidebar that slides in/out via negative margin; graph view is modal, terminal is bottom dock, and file browser is left.
  - Chat must live in the right sidebar alongside Backlinks to keep layout stable. The most natural fit is a shared right panel with tabs (Backlinks | Chat), avoiding competing panels.
  - The current toggles use Ctrl+B for backlinks and Ctrl+G for graph; a new chat toggle should align with existing patterns and not conflict with terminal/backlinks.
  - The bottom toolbar contains Backlinks and Graph buttons; Chat should be added here to keep discoverability consistent.
  - Sidebar width is fixed at 280px today; chat input needs a scrollable message list and a docked input with padding to avoid overlap.
  - The Intelligence button in the FileBrowser is a natural entry point to open the chat sidebar.
- Decisions:
  - Introduce a right panel “mode” state: none | backlinks | chat. This preserves the single sidebar slot and prevents layout conflicts.
  - Add a Chat toggle next to Backlinks in the bottom bar; use a new shortcut only if needed.
- Rule: Copy from OpenCode when it fits perfectly; avoid unnecessary implementation.
