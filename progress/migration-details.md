# Migration Details (from doc-ai)

This file contains the detailed phase-by-phase migration history and source mapping from the original `doc-ai` project. Moved here from CLAUDE.md to keep the main file concise.

---

## Phase Breakdown

### Phase 1: Project Scaffold
- **1.1** — Monorepo root (`package.json`, `pnpm-workspace.yaml`, root `tsconfig.json`). Copied from doc-ai, removed tiptap/opencode references. → [1.1-monorepo-scaffold.md](1.1-monorepo-scaffold.md)
- **1.2** — Shared types package (`packages/types`). Extracted `FileTreeNode`, `WorkspaceMetadata`, `Range`, `Position`, `TextEdit`, `WorkspaceEdit`, terminal types, coordinator RPC types. → [1.2-shared-types.md](1.2-shared-types.md)
- **1.3** — Shared tsconfig package (`packages/tsconfig`). `node.json` for coordinator, `nextjs.json` for frontend. → [1.3-shared-tsconfig.md](1.3-shared-tsconfig.md)

### Phase 2: Coordinator Server
- **2.1** — Copied coordinator app (`apps/coordinator`): `server.ts`, `workspace/manager.ts`, `package.json`, tsconfig. → [2.1-coordinator-copy.md](2.1-coordinator-copy.md)
- **2.2** — Stripped OpenCode from coordinator. Removed `src/opencode/` folder, opencode/* handlers, chat handlers, permission system, session management, streaming events. → [2.2-strip-opencode-coordinator.md](2.2-strip-opencode-coordinator.md)
- **2.3** — Stripped ProseMirror/markdown-converter. Removed `utils/markdown-converter.ts`, `textDocument/codeAction` handler. → [2.3-strip-prosemirror-coordinator.md](2.3-strip-prosemirror-coordinator.md)
- **2.4** — Verified coordinator builds and starts cleanly. → [2.4-coordinator-builds.md](2.4-coordinator-builds.md)

### Phase 3: Frontend Shell
- **3.1** — Created frontend app (`apps/frontend`). Copied Next.js skeleton, removed tiptap/opencode/editor deps. → [3.1-frontend-scaffold.md](3.1-frontend-scaffold.md)
- **3.2** — Copied coordinator client. Stripped OpenCode methods, kept file/terminal/document operations. → [3.2-coordinator-client.md](3.2-coordinator-client.md)
- **3.3** — Copied workspace store. Stripped OpenCode context calls. → [3.3-workspace-store.md](3.3-workspace-store.md)

### Phase 4: File Browser
- **4.1** — Copied all workspace components (9 files, ~95% reusable). → [4.1-workspace-components.md](4.1-workspace-components.md)
- **4.2** — Fixed imports (`@doc-ai/types` → `@cushion/types`), verified file browser. → [4.2-workspace-imports-verify.md](4.2-workspace-imports-verify.md)

### Phase 5: Terminal
- **5.1** — Copied `SimpleTerminal.tsx`, `TerminalPanel.tsx`, `Terminal.tsx`. Dropped OpenCode chat components. → [5.1-terminal-components.md](5.1-terminal-components.md)
- **5.2** — Stripped OpenCode from SimpleTerminal. → [5.2-strip-opencode-terminal.md](5.2-strip-opencode-terminal.md)
- **5.3** — Verified terminal end-to-end. → [5.3-terminal-verify.md](5.3-terminal-verify.md)

### Phase 6: Markdown Editor
- **6.1** — Created CodeMirror-based markdown editor with syntax highlighting. → [6.1-markdown-editor.md](6.1-markdown-editor.md)
- **6.2** — Wired editor to coordinator (`didOpen`, `didChange`, `save-file`). → [6.2-editor-coordinator-wire.md](6.2-editor-coordinator-wire.md)
- **6.3** — Multi-filetype support (markdown, JSON, JS/TS, plain text). → [6.3-multi-filetype.md](6.3-multi-filetype.md)

### Phase 7: Layout & Integration
- **7.1** — Three-panel layout with resizable panels, Ctrl+` terminal toggle. → [7.1-main-layout.md](7.1-main-layout.md)
- **7.2** — Wired file browser → tabs → editor → store. → [7.2-integration.md](7.2-integration.md)
- **7.3** — End-to-end smoke test. → [7.3-smoke-test.md](7.3-smoke-test.md)

### Phase 8: Cleanup
- **8.1** — Removed dead code and unused dependencies. → [8.1-cleanup.md](8.1-cleanup.md)
- **8.2** — Renamed package scope `@doc-ai` → `@cushion`. → [8.2-rename-scope.md](8.2-rename-scope.md)

### Phase 9: Tangent-Style Features
- **9.1** — Frontmatter parsing (`lib/frontmatter.ts`). YAML between `---` delimiters, lenient parsing.
- **9.2** — FileHeader component. Title = filename, editing renames file. Centered layout matching content.
- **9.3** — Layout alignment. Padding formula: `calc(2em / fontSizeFactor)`. Single scroll container.
- **9.4** — File rename → sidebar refresh via `EditorPanel.onFileRenamed` callback.

### Phase 10: Wiki-Links & Connections
- **10.1** — Wiki-links (`[[note]]`, `[[note#header]]`, `[[note|display]]`). Fuzzy resolution, WYSIWYG display, click navigation. → [10.1-wiki-links.md](10.1-wiki-links.md)
- **10.2** — Wiki-link autocomplete triggered by `[[`. Fuzzy search, "Create new note" option.
- **10.3** — Backlinks panel (Ctrl+B). Shows linking files with context.
- **10.4** — Graph view (Ctrl+G). Hierarchical tree layout, Bezier edges, cycle detection.
- **10.6** — Quick switcher (Ctrl+O). Fuzzy file search, keyboard navigation.
- **10.5** — Tag browser — *Skipped*
- **10.7** — Daily notes — *Skipped*

### Phase 11: PDF Viewer
- **11.1** — pdf.js native viewer (`PdfViewerNative.tsx`). Annotation editing (text, ink, highlight, stamp), Ctrl+Scroll zoom, search, page navigation, rotate/download/print/save. Saves annotated PDFs back to workspace via `workspace/save-file-base64`.

---

## Source Mapping (doc-ai → cushion)

### Copied files

| Source | Reuse % |
|--------|---------|
| `apps/coordinator/src/server.ts` | ~70% (stripped opencode+prosemirror) |
| `apps/coordinator/src/workspace/manager.ts` | ~90% |
| `apps/coordinator/package.json` | ~80% |
| `apps/frontend/lib/coordinator-client.ts` | ~85% |
| `apps/frontend/lib/shared-coordinator-client.ts` | 100% |
| `apps/frontend/stores/workspaceStore.ts` | ~85% |
| `apps/frontend/components/workspace/*` | ~95% (all 9 files) |
| `apps/frontend/components/terminal/SimpleTerminal.tsx` | ~80% |
| `apps/frontend/components/terminal/TerminalPanel.tsx` | ~95% |
| `apps/frontend/components/terminal/Terminal.tsx` | 100% |
| `apps/frontend/app/layout.tsx` | ~90% |
| Root `pnpm-workspace.yaml` | 100% |

### Dropped from doc-ai

- `apps/frontend/components/editor/` — entire Tiptap/ProseMirror editor
- `apps/frontend/lib/diff-extension.ts`, `text-mirror-extension.ts`, `inline-suggestion-extension.ts`, `slash-command-extension.*`, `document-utils.ts`, `document-creator.ts`, `*-drag-*`, `*-table-*`, `*-image-*`
- `apps/coordinator/src/opencode/` — entire OpenCode SDK
- `apps/coordinator/src/utils/markdown-converter.ts`
- `apps/frontend/components/terminal/` — OpenCodeChat, ChatHistory, ChatInput, messageParser, Collapsible*, TerminalSidebar, IsolatedTerminal, XTermComponent
- `apps/frontend/components/opencode-sidebar/`

---

## Reference Implementations

| Feature | Tangent File | What to Learn |
|---------|--------------|---------------|
| Title header | `WorkspaceFileHeader.svelte` | Title = filename, rename on blur |
| Frontmatter | `NoteParser.ts` (lines 310-425) | YAML parsing, error handling |
| Layout | `NoteEditor.svelte` (lines 1455-1464) | Centered content, margins |
| File tree updates | `Workspace.ts` (lines 383-445) | TreeChange event handling |
| Reactive stores | `SelfStore.ts` | Svelte store pattern |
