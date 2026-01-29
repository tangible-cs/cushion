# Cushion

Local-first markdown workspace inspired by **Obsidian**, **Tangent**, and **Zettlr**.
Reference implementations: `Tangent/` and `Zettlr/` (both in repo root).

## Architecture

pnpm monorepo. Run with `pnpm install && pnpm dev`.

| Package | Tech | Purpose |
|---------|------|---------|
| `apps/coordinator` | Node + ws | WebSocket server (JSON-RPC). File ops, document tracking, terminal sessions |
| `apps/frontend` | Next.js + Tailwind | UI. CodeMirror editor, file browser, terminal (xterm.js), PDF viewer |
| `packages/types` | TypeScript | Shared types (`FileTreeNode`, `WorkspaceMetadata`, RPC types, etc.) |
| `packages/tsconfig` | — | Shared tsconfig (`node.json`, `nextjs.json`) |

## Key Files

### Coordinator
- `apps/coordinator/src/server.ts` — WebSocket server, RPC handler dispatch
- `apps/coordinator/src/workspace/manager.ts` — File CRUD, workspace state, base64 read/write

### Frontend
- `apps/frontend/components/editor/EditorPanel.tsx` — Editor container, tabs, file open/save, PDF wiring
- `apps/frontend/components/editor/CodeEditor.tsx` — CodeMirror markdown editor
- `apps/frontend/components/editor/PdfViewerNative.tsx` — pdf.js viewer with native annotation editing, saves to workspace via `save-file-base64`
- `apps/frontend/components/editor/FileHeader.tsx` — Editable title (rename = file rename)
- `apps/frontend/components/editor/BacklinksPanel.tsx` — Backlinks sidebar (Ctrl+B)
- `apps/frontend/components/workspace/FileBrowser.tsx` — File tree with context menu actions
- `apps/frontend/components/terminal/SimpleTerminal.tsx` — xterm.js terminal
- `apps/frontend/components/graph/GraphView.tsx` — Tangent-style graph (Ctrl+G)
- `apps/frontend/components/quick-switcher/QuickSwitcher.tsx` — Fuzzy file switcher (Ctrl+O)
- `apps/frontend/lib/coordinator-client.ts` — WebSocket RPC client
- `apps/frontend/lib/codemirror-wysiwyg/` — WYSIWYG extensions (wiki-links, autocomplete, focus mode, etc.)
- `apps/frontend/lib/frontmatter.ts` — YAML frontmatter parsing
- `apps/frontend/lib/wiki-link.ts` — `[[note]]` syntax parsing
- `apps/frontend/lib/wiki-link-resolver.ts` — Fuzzy file resolution
- `apps/frontend/lib/link-index.ts` — Link index for backlinks and graph
- `apps/frontend/stores/workspaceStore.ts` — Zustand store (tabs, open files, preferences)

## Coordinator RPC Methods

| Method | Purpose |
|--------|---------|
| `workspace/open` | Open a workspace folder |
| `workspace/files` | List file tree |
| `workspace/file` | Read file (text) |
| `workspace/file-base64` | Read file (binary, for PDFs) |
| `workspace/save-file` | Save text file |
| `workspace/save-file-base64` | Save binary file (annotated PDFs) |
| `workspace/rename` | Rename file/folder |
| `workspace/delete` | Delete file/folder |
| `workspace/duplicate` | Duplicate file |
| `textDocument/didOpen` | Notify file opened |
| `textDocument/didChange` | Notify file changed |
| `terminal/create` | Create terminal session |
| `terminal/input` | Send input to terminal |
| `terminal/resize` | Resize terminal |
| `terminal/destroy` | Close terminal |

## Design Principles

- **File-first**: Title = filename, editing title renames the file
- **Centered content**: `max-width` + `margin: 0 auto`, padding formula `calc(2em / fontSizeFactor)`
- **Single scroll container**: Parent scrolls, CodeMirror `overflow: visible`
- **WYSIWYG markdown**: Syntax hidden when cursor is off-line (focus mode)
- **Wiki-links**: `[[note]]`, `[[note#header]]`, `[[note|display]]` with fuzzy resolution

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+S | Save current file |
| Ctrl+O | Quick switcher |
| Ctrl+B | Toggle backlinks panel |
| Ctrl+G | Toggle graph view |
| Ctrl+F | Search (in PDF viewer) |
| Ctrl+` | Toggle terminal |
| Ctrl+Scroll | Zoom (PDF viewer) |

## CodeMirror WYSIWYG Rules (IMPORTANT)

These rules prevent cursor-jumping bugs. Violating them **will** break arrow-key navigation.

1. **Never rebuild `Decoration.replace` synchronously on `selectionSet`.**
   Toggling replace decorations changes line geometry (text width → wrapping → height).
   CodeMirror calculates the next cursor position using **pre-update** geometry, so synchronous
   decoration changes cause the cursor to land on the wrong line.
   → The `hideMarkupPlugin` defers selection-triggered rebuilds via `requestAnimationFrame`.
   → Only `docChanged` and `viewportChanged` rebuild synchronously.

2. **Always apply line-level classes (`Decoration.line`) regardless of cursor position.**
   Classes like `cm-heading-1`, `cm-blockquote`, `cm-code-block` set font-size/line-height.
   If they toggle on/off when the cursor enters/leaves, line height changes → cursor jumps.
   → Conditionally hide **inline syntax** (`##`, `>`, etc.) but keep the line class constant.

3. **Never use `margin` on `.cm-line` elements.**
   CodeMirror doesn't track margins in its height measurement system.
   → Use `padding-bottom` instead of `margin-bottom` for spacing (e.g., headings).

4. **Code block fences** are hidden via CSS (`cm-code-fence-hidden` with `height:0`)
   and revealed when `cursorInRange` detects the cursor inside the block.

## Migration History

Originally built from `doc-ai/` codebase (stripped OpenCode/ProseMirror/Tiptap).
Full migration details: [progress/migration-details.md](progress/migration-details.md)

All 11 phases complete. Progress files in `progress/` folder.
