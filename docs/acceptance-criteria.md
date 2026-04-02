# Acceptance Criteria

## Product-level success criteria

The rewrite is successful when:

1. The app opens markdown workspaces quickly on Apple silicon.
2. Editing feels smoother and more responsive than the Electron-based app.
3. Memory usage is materially lower than a Chromium-shell desktop app for comparable workflows.
4. Multi-window, menus, shortcuts, drag and drop, and settings feel like native macOS behaviors.
5. Markdown files remain trustworthy, portable, and canonical on disk.
6. AI features are useful, fast, cancelable, and do not destabilize the core writing workflow.
7. PDF and dictation workflows feel integrated rather than bolted on.
8. The codebase is modular enough to support future expansion without architectural collapse.

## Phase 1 acceptance criteria

- user can open a workspace folder
- file tree displays markdown files and relevant adjacent files
- user can open multiple documents
- recent workspaces are persisted
- app state restores cleanly after relaunch
- no obvious main-thread stutters when opening modest workspaces

## Phase 2 acceptance criteria

- editor supports normal markdown authoring comfortably
- undo/redo works reliably
- cursor movement and selection feel native
- find/replace works in active document
- large documents do not freeze the UI
- syntax display behavior is intentional and predictable

## Phase 3 acceptance criteria

- key actions are reachable through menus and shortcuts
- command palette speeds up navigation and actions
- drag and drop works for supported workflows
- multiple windows behave predictably
- search and navigation feel integrated into the app shell

## Phase 4 acceptance criteria

- user can ask questions about the current document or selection
- AI responses stream progressively where supported
- cancellation is reliable
- provider configuration is manageable
- AI failure states are clear and recoverable

## Phase 5 acceptance criteria

- PDFs open and render natively
- search within PDF works
- OCR path is available where applicable
- dictation/transcription can be invoked and inserted into the editor intentionally

## Phase 6 acceptance criteria

- any Metal-backed feature has a documented reason for existing
- rendering-heavy surfaces perform smoothly on Apple silicon
- rendering modules remain isolated from core editor logic

## Phase 7 acceptance criteria

- launch time meets target budget
- scrolling and editing remain smooth in realistic workspaces
- memory footprint remains appropriate for a native app
- accessibility audit identifies no critical blockers
- app packaging and release process are documented

## Performance budgets

Initial target budgets to refine later:

- cold launch to usable shell: under 1.5 seconds on target Apple silicon hardware
- opening a typical markdown document: perceptibly immediate
- workspace indexing: incremental and non-blocking
- long AI requests: never block editing or navigation
- large-document editing: no prolonged main-thread hitching

## Quality bars

- no unexplained compatibility islands
- no hidden storage of canonical content away from user files
- no critical workflow dependent on an embedded browser unless explicitly justified

## Test quality bars

These are product-level acceptance criteria, not optional targets:

- TDD was the methodology used throughout — tests exist for all non-trivial logic
- all module coverage floors from `docs/testing-strategy.md` are met at product close
- CI runs on every branch push: tests, lint, coverage check, performance baseline comparison
- no production target has build warnings (warnings treated as errors)
- SwiftLint passes with no suppressed rules without documented reason
- performance baselines are committed for all critical paths and none are regressed at close
- the XCUITest suite covers open, edit, AI request, and PDF preview flows end-to-end
- no test is permanently skipped without a written reason and a condition for resolution
- coverage must not have regressed between any two consecutive phases
