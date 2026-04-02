# Phases

## Phase 0 — Discovery and freeze

### Objective
Understand the current Cushion product and define the target native product before implementation.

### Deliverables
- docs/current-product-map.md
- docs/mac-gap-analysis.md
- docs/vision.md
- docs/architecture.md
- docs/ux-principles.md
- docs/acceptance-criteria.md
- docs/testing-strategy.md

### Key tasks
- inventory current features and workflows
- identify essential parity items versus optional items
- document platform-specific opportunities on Mac
- define what will not be copied directly
- define TDD methodology, coverage floors, and quality gates

### Exit criteria
A stakeholder can read the planning docs and understand what is being built, why, in what order, and with what tradeoffs. The testing strategy is documented and agreed before any implementation begins.

## Phase 1 — Native foundation

### Objective
Stand up the native application shell, workspace handling, and app infrastructure.

### Build
- Xcode workspace and module scaffolding with test targets for every module
- CI pipeline configured: `xcodebuild test`, SwiftLint, coverage extraction
- SwiftData model container with protocol-isolated access for testability
- SwiftUI app entry and scenes
- settings window
- recent workspaces
- open folder or workspace flow
- file browser
- basic document opening
- metadata persistence and restoration
- command menu scaffolding

### Test deliverables
- WorkspaceCore unit tests: recent workspace CRUD, file tree enumeration, metadata model
- WorkspaceCore integration tests: real temp-directory open/close/restore flows
- CushionApp unit tests: settings model, restoration state
- performance baseline: workspace open time for a fixture workspace of 100 files
- SwiftLint passing, zero warnings in production targets

### Coverage gate
- WorkspaceCore ≥ 80%
- CushionApp ≥ 60%

### Exit criteria
A user can open a workspace, browse files, open markdown documents, and relaunch the app without losing core state. CI is green. Coverage floors are met.

## Phase 2 — Markdown editor core

### Objective
Create a native editing experience good enough to become the heart of the product.

### Build
- TextKit-backed editor foundation
- markdown tokenization and presentation model
- focus-sensitive syntax visibility rules
- undo/redo
- block-level editing operations
- selection and cursor behavior
- find/replace
- keyboard shortcut support
- basic inline asset rendering

### Test deliverables
- EditorCore unit tests: tokenizer correctness for all markdown syntax elements (parameterized with Swift Testing `@Test(arguments:)`)
- EditorCore unit tests: block transform operations (indent, list toggle, heading promotion)
- EditorCore unit tests: undo/redo stack behavior
- EditorCore unit tests: find/replace match logic and edge cases
- EditorCore integration tests: round-trip parse → edit → serialize for representative fixtures
- performance baselines: parse time for small (1 KB), medium (50 KB), and large (500 KB) markdown documents
- performance baseline: time-to-first-render for each fixture size

### Coverage gate
- EditorCore ≥ 85%

### Exit criteria
A serious user can spend real time editing documents and prefer the workflow over a generic text view. EditorCore coverage gate is met. All tokenizer and transform paths have parameterized tests. Performance baselines are committed.

## Phase 3 — Mac-first workflows

### Objective
Make the app feel truly native and high-leverage for Mac users.

### Build
- complete command menu coverage
- command palette
- toolbar and inspector polish
- drag and drop behavior
- reveal in Finder
- Quick Look-friendly flows where relevant
- multi-window refinement
- search across workspace metadata

### Test deliverables
- WorkspaceCore unit tests: search index construction and query correctness
- XCUITest smoke tests: open workspace → navigate to file → edit → confirm state
- XCUITest smoke test: multi-window open same workspace, confirm isolation
- DesignSystem snapshot tests for primary reusable controls

### Coverage gate
- WorkspaceCore ≥ 80% maintained
- DesignSystem ≥ 65%
- full suite passes; no test regressions from Phase 1 or 2

### Exit criteria
The app feels like a real Mac productivity tool rather than a technical preview. XCUITest suite passes for all defined smoke tests. No coverage regression.

## Phase 4 — AI integration

### Objective
Introduce an AI layer that enhances document workflows without dominating the architecture.

### Build
- dockable AI sidebar
- selected-text actions
- document-aware chat context
- workspace-aware summarization and exploration
- provider settings
- streaming responses
- cancellation
- prompt history
- local-vs-remote routing hooks

### Test deliverables
- AIClient unit tests: provider protocol conformance via fake implementations
- AIClient unit tests: prompt context assembly (document content, selection, workspace metadata injection)
- AIClient unit tests: routing logic (local vs remote decision rules)
- AIClient unit tests: cancellation and retry behavior using fake async streams
- AIClient unit tests: prompt history persistence model
- AIClient integration tests: streaming response parsing from fixture payloads
- no real network calls in any unit test

### Coverage gate
- AIClient ≥ 80%
- no coverage regression in EditorCore or WorkspaceCore

### Exit criteria
Users can perform useful document-aware AI tasks reliably inside the workspace. All AIClient logic is covered by protocol-isolated tests. No network calls in the unit test suite.

## Phase 5 — PDF, dictation, and adjacent content

### Objective
Replace sticky secondary features with native implementations.

### Build
- PDF preview and search
- OCR entry points
- dictation and transcription flow
- attachment preview support
- optional compatibility bridge for any essential non-native feature still pending replacement

### Test deliverables
- FilePreview unit tests: file type routing logic, OCR result handling
- FilePreview integration tests: PDF open and page count with fixture documents
- SpeechServices unit tests: session lifecycle state machine, permission-denied error path
- SpeechServices unit tests: transcription result insertion model
- XCUITest smoke test: open PDF → search within PDF → confirm result count

### Coverage gate
- FilePreview ≥ 70%
- SpeechServices ≥ 70%
- no regression in other modules

### Exit criteria
Adjacent content workflows feel integrated and native. FilePreview and SpeechServices coverage gates are met.

## Phase 6 — Rendering enhancements and canvas

### Objective
Add advanced rendering and canvas features where they deliver real value.

### Build
- minimap or advanced rendering surfaces if justified
- canvas or diagramming foundation if validated
- Metal-backed performance enhancements for rendering-heavy views

### Test deliverables
- CanvasKit unit tests: layout and coordinate math, hit testing, tile calculation
- CanvasKit unit tests: any state machine driving rendering decisions
- performance baselines: frame render time for representative canvas content
- documented reason for every Metal surface in the module (required for phase gate)

### Coverage gate
- CanvasKit ≥ 60%
- no regression in other modules

### Exit criteria
Any rendering-heavy view is measurably smooth and architecturally isolated. CanvasKit coverage gate is met. Every Metal surface has a documented rationale.

## Phase 7 — Performance, packaging, and polish

### Objective
Turn the product from a functional native app into a polished Apple silicon application.

### Build
- launch optimization
- memory and battery tuning
- indexing improvements
- large-workspace performance tuning
- accessibility pass
- error-state polish
- signing, packaging, notarization readiness

### Test deliverables
- full coverage report across all modules, reviewed and published
- all performance baselines re-evaluated and updated to reflect tuned implementation
- XCUITest suite extended to cover error states and recovery flows
- accessibility audit run with VoiceOver and documented
- any previously skipped tests resolved or explicitly deferred with written rationale

### Coverage gate
All module coverage floors must be met simultaneously (no module below its threshold).

### Exit criteria
The app is ready for serious daily use on Apple silicon Macs. All coverage floors are met. All performance baselines pass. No skipped tests without written rationale. Accessibility audit has no critical blockers.
