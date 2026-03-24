# Cushion

Local-first markdown workspace inspired by Obsidian, with integrated AI chat. Bun monorepo — run with `bun install && bun run dev`.

## Stack

- **Frontend** (`apps/frontend`): Vite, React 19, Tailwind, CodeMirror 6, Zustand. Connects to coordinator via WebSocket and to AI via OpenCode SDK. Runs standalone in the browser or as Electron's renderer.
- **Electron** (`apps/electron`): Electron shell that spawns the coordinator as a child process, provides native OS dialogs, and loads the frontend via electron-vite.
- **Coordinator** (`apps/coordinator`): Bun WebSocket server (JSON-RPC). Handles file CRUD, workspace state, AI provider management, and file watching (chokidar).
- **Shared packages**: `packages/types` for shared TypeScript types, `packages/tsconfig` for shared configs.

## Key Concepts

- **File-first**: title = filename; editing the title renames the file.
- **WYSIWYG markdown**: CodeMirror with custom extensions that hide syntax when the cursor is off-line.
- **Wiki-links**: `[[note]]`, `[[note#header]]`, `[[note|display]]` with fuzzy resolution and backlinks.
- **Singleton clients**: single WebSocket/SDK instances shared across the app.

## Design Principles

Clean, modular code. Small focused modules, clear separation of concerns, no unnecessary abstractions.

## Testing

- Use `bun run test` (not `bun test`) from the root. Bare `bun test` uses Bun's native runner which skips vitest's jsdom environment, causing false failures in frontend tests.
- Frontend tests: `vitest run` with jsdom environment (`apps/frontend/vitest.config.ts`).
- Coordinator tests: Bun's native test runner (`bun test` from `apps/coordinator`).

## INSTRUCTIONS

- Do not start or end my server, I will have it on hot reload.
- `/inspo` folder has apps that inspire cushion. Ignore this folder if not asked to search information here.
- Use ls if any you cant find any folder
- Use Globalcss colors, do not add new colors, if you really want to, ask the user first

