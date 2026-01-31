# OpenCode Chat UI Parity Differences

This document tracks differences between Cushion's chat UI and the OpenCode desktop app UI.

**Comparison target**: OpenCode Desktop (Tauri-based app). Focus is desktop UI parity.

## Priority Legend
- **HIGH** - Critical UX/behavior gap
- **MEDIUM** - Important UI/interaction difference
- **LOW** - Nice-to-have or edge-case parity

---

## STATUS SUMMARY

### Fixed or Mostly Aligned
1. ✅ @ mention searches workspace + grouping + fuzzy match
2. ✅ Scroll behavior for nested blocks + auto-scroll working-state fixes
3. ✅ Markdown rendering for text/reasoning parts
4. ✅ Tool part styling (BasicTool-like wrapper, icons, collapsible)
5. ✅ Copy buttons for user and response text (basic parity, no tooltip)
6. ✅ Resizable chat panel width + resizable prompt height (desktop)
7. ✅ Prompt input container (card layout, sections, drop overlay, shell mode)
8. ✅ Context chips parity (icons, tooltips, scroll, remove affordance)
9. ✅ Attachment thumbnails
10. ✅ Diff summary accordion (sticky headers, file icons, change bars)
11. ✅ Session turn resume-scroll button + duration display
12. ✅ Diff hunk expansion (show only changed parts with expandable separators)

---

## 1. LAYOUT + RESIZING (HIGH)

### Resolved: Chat panel width is resizable
- **Cushion**: `apps/frontend/app/page.tsx` - resizable right panel width with `ResizeHandle` + localStorage persistence
- **OpenCode**: `opencode/packages/app/src/pages/session.tsx` - resizable panel width with `ResizeHandle`

### Resolved: Prompt input height is resizable
- **Cushion**: `apps/frontend/components/chat/ChatSidebar.tsx` - resizable prompt dock + localStorage persistence
- **OpenCode**: `opencode/packages/app/src/pages/session.tsx` - resizable prompt height, CSS var `--prompt-height`

---

## 2. SESSION TURN LAYOUT (HIGH)

### Resolved: Turn spacing + sticky header + gradient separation
- **Cushion**: `apps/frontend/components/chat/MessageList.tsx`, `apps/frontend/app/globals.css` - sticky turn container with exact OpenCode padding (9px), gradient separation
- **OpenCode**: `opencode/packages/ui/src/components/session-turn.tsx`, `session-turn.css` - sticky user header with title offset + gradient separation

### Resolved: Resume-scroll button
- **Cushion**: Floating resume-scroll button when user scrolls away
- **OpenCode**: `opencode/packages/app/src/pages/session.tsx` - floating resume-scroll button when user scrolls away

### Resolved: Duration display
- **Cushion**: Live duration next to status
- **OpenCode**: `opencode/packages/ui/src/components/session-turn.tsx` - live duration next to status

---

## 3. USER MESSAGE DISPLAY (MEDIUM-HIGH)

### Issue: Long user messages do not collapse
- **Cushion**: Full text always visible
- **OpenCode**: Collapse/expand with gradient fade and chevron
- **Refs**: `apps/frontend/components/chat/MessageList.tsx` vs `opencode/packages/ui/src/components/message-part.tsx`

### Issue: User message container styling
- **Cushion**: Basic bubble, minimal token usage
- **OpenCode**: Tokenized bubble styling with hover copy button placement
- **Refs**: `apps/frontend/components/chat/MessageList.tsx`, `apps/frontend/app/globals.css` vs `opencode/packages/ui/src/components/message-part.css`

---

## 4. ASSISTANT RESPONSE SUMMARY (MEDIUM)

### Issue: Summary layout and animations
- **Cushion**: Basic header + response + diff list
- **OpenCode**: Title + summary area with fade-up animation and optional diff accordion
- **Refs**: `apps/frontend/components/chat/MessageList.tsx` vs `opencode/packages/ui/src/components/session-turn.tsx`

---

## 5. PROMPT INPUT CONTAINER (HIGH)

### Resolved: Prompt input card layout
- **Cushion**: Card container with sections (chips, attachments, editor, actions), drag overlay
- **OpenCode**: Raised card container with sections (chips, attachments, editor, actions)
- **Refs**: `apps/frontend/components/chat/PromptInput.tsx` vs `opencode/packages/app/src/components/prompt-input.tsx`

### Partial: Scrollbar arrows removed in prompt editor
- **Cushion**: `apps/frontend/components/chat/PromptInput.tsx`, `apps/frontend/app/globals.css` - hidden scrollbars to remove arrows
- **OpenCode**: Scrollbars hidden for prompt editor

### Resolved: Drag-and-drop overlay UI
- **Cushion**: Global drag state + overlay with dashed border and icon
- **OpenCode**: Global drag state + overlay with dashed border and icon
- **Refs**: `apps/frontend/components/chat/PromptInput.tsx` vs `opencode/packages/app/src/components/prompt-input.tsx`

### Resolved: Shell mode visual feedback
- **Cushion**: Icon + label + escape hint, monospace editor
- **OpenCode**: Icon + label + escape hint, monospace editor
- **Refs**: `apps/frontend/components/chat/PromptInput.tsx` vs `opencode/packages/app/src/components/prompt-input.tsx`

---

---

## 7. CONTEXT CHIPS + ATTACHMENTS (MEDIUM)

### Resolved: Context chips parity
- **Cushion**: Scrollable chips with file icons, tooltips, line ranges, hover remove
- **OpenCode**: Scrollable chips with file icons, tooltips, line ranges, hover remove
- **Refs**: `apps/frontend/components/chat/PromptInput.tsx` vs `opencode/packages/app/src/components/prompt-input.tsx`

### Resolved: Attachment thumbnails
- **Cushion**: Thumbnails with hover remove overlay + filename strip
- **OpenCode**: Thumbnails with hover remove overlay + filename strip
- **Refs**: `apps/frontend/components/chat/PromptInput.tsx` vs `opencode/packages/app/src/components/prompt-input.tsx`

---

## 8. PERMISSIONS + QUESTIONS (MEDIUM-HIGH)

### Issue: Permissions panel location
- **Cushion**: Separate panel in sidebar
- **OpenCode**: Inline in tool part, "Allow once/always/deny"
- **Refs**: `apps/frontend/components/chat/ChatSidebar.tsx` vs `opencode/packages/ui/src/components/message-part.tsx`

### Issue: Questions flow
- **Cushion**: Basic panel
- **OpenCode**: Tabbed multi-question UI with review step
- **Refs**: `apps/frontend/components/chat/ChatSidebar.tsx` vs `opencode/packages/ui/src/components/message-part.tsx`

---

## 9. DIFF SUMMARY + REVIEW (MEDIUM)

### Resolved: Diff summary accordion
- **Cushion**: Sticky accordion headers, file icons, change bars, expandable hunks
- **OpenCode**: Sticky accordion headers, file icons, change bars, expandable hunks
- **Refs**: `apps/frontend/components/chat/MessageList.tsx` vs `opencode/packages/ui/src/components/session-turn.tsx`, `diff-changes.css`, `sticky-accordion-header.css`

### Resolved: Diff hunk expansion (show only changed parts)
- **Cushion**: Hunk-based diff display showing only changed lines with 3-line context, expandable separators
- **OpenCode**: Hunk-based diff display with context expansion (expansionLineCount: 20)
- **Refs**: `apps/frontend/components/chat/MessageList.tsx` (computeDiffHunks, DiffView with expand separators) vs `opencode/packages/ui/src/pierre/index.ts`

### Resolved: Diff preview colors
- **Cushion**: Red/green accents in before/after blocks + change counts
- **OpenCode**: Red/green accents in diff previews

### Issue: Review view missing
- **Cushion**: No review screen
- **OpenCode**: Dedicated session review layout with sticky header
- **Refs**: `opencode/packages/ui/src/components/session-review.css`

---

## 10. TABS + FILE CONTEXT (MEDIUM)

### Issue: Tabs feel cramped
- **Cushion**: Small height, no file icons
- **OpenCode**: 48px tabs, file icons, draggable, hidden scrollbars
- **Refs**: `apps/frontend/components/editor/EditorTabs.tsx` vs `opencode/packages/ui/src/components/tabs.css`, `opencode/packages/app/src/components/session/session-sortable-tab.tsx`

---

## 11. MESSAGE NAV (LOW)

### Issue: Message navigation rail missing
- **Cushion**: No message nav component
- **OpenCode**: MessageNav with compact/normal modes and diff bars
- **Refs**: `opencode/packages/ui/src/components/message-nav.tsx`, `message-nav.css`

---

## 12. THEME + TOKEN SYSTEM (MEDIUM)

### Issue: Tokenized theme not aligned
- **Cushion**: Tailwind + custom CSS, system fonts
- **OpenCode**: Full token system (colors, shadows, spacing, typography)
- **Refs**: `apps/frontend/app/globals.css` vs `opencode/packages/ui/src/styles/theme.css`, `colors.css`, `base.css`

---

## 13. OTHER SMALL PARITY GAPS (LOW)

- Tooltip keybind hints in prompt input and header buttons
- Session header search + status popover + share UI
- Retry count display formatting

---

## NOTES

The items above are scoped to the desktop UI parity request. Web-only features were excluded.