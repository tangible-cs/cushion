# Architecture

## Overview

Cushion for Mac uses a layered modular architecture designed to preserve local file ownership, support excellent native editing, and isolate platform-specific and performance-sensitive concerns.

## Architectural layers

### 1. App shell layer
Owned by `CushionApp`

Responsibilities:
- app lifecycle
- scenes and windows
- command menus
- dependency composition
- settings
- top-level navigation and inspectors
- app-wide environment state

Primary technologies:
- SwiftUI
- AppKit interoperability where necessary

### 2. Workspace and document layer
Owned primarily by `WorkspaceCore`

Responsibilities:
- workspace open and close
- file tree and item metadata
- file watching and coordination
- recent workspaces
- indexing and search metadata
- open document tracking
- workspace-level preferences

Primary technologies:
- FileManager
- NSFileCoordinator or equivalent coordination patterns as needed
- SwiftData for metadata and state
- Spotlight-friendly metadata where useful

### 3. Editing engine layer
Owned by `EditorCore`

Responsibilities:
- document model
- markdown parsing and presentation model
- editing transactions
- selection and cursor model
- block-level transformations
- syntax-aware display behavior
- find/replace
- undo/redo integration

Primary technologies:
- TextKit-backed native editing infrastructure
- attributed text and custom layout/presentation logic

### 4. AI services layer
Owned by `AIClient`

Responsibilities:
- provider abstraction
- prompt/context assembly
- streaming responses
- cancellation and retries
- local versus remote routing
- per-workspace provider settings
- document-aware actions
- future tool execution and MCP bridging

Primary technologies:
- protocol-based service adapters
- Apple Foundation Models where available and appropriate
- external provider connectors where configured

### 5. Preview and auxiliary content layer
Owned by `FilePreview` and `SpeechServices`

Responsibilities:
- PDF preview and interaction
- file previews for non-markdown items
- OCR hooks
- dictation and transcription
- media-related secondary features

Primary technologies:
- PDFKit
- Vision
- Speech framework

### 6. Rendering-heavy layer
Owned by `CanvasKit`

Responsibilities:
- minimap rendering
- canvas surfaces
- rendering-intensive overlays
- future graph or diagram surfaces
- advanced compositing

Primary technologies:
- Metal
- MetalKit when useful

## Canonical data model

### Source of truth
- Markdown document contents live on disk.
- The app reads, edits, and writes those files through a document-safe file workflow.

### App-owned data
Stored in SwiftData or equivalent app storage:
- recent workspaces
- window and editor restoration state
- cached indexes
- file metadata snapshots
- prompt history and AI session metadata
- settings and preferences
- derived summaries or embeddings if introduced later

## Module responsibilities

### CushionApp
- app entry point
- scene management
- dependency injection
- commands and menus
- settings and high-level window wiring

### WorkspaceCore
- file system traversal
- file event handling
- indexing coordination
- workspace state
- search metadata
- recent workspace logic

### EditorCore
- markdown document abstraction
- parser/token model
- editing engine
- text presentation policies
- block transforms and keyboard editing behavior
- find/replace and undo support

### AIClient
- provider configuration
- request/response models
- task orchestration
- document and workspace context injection
- local and remote routing strategy

### FilePreview
- PDF views
- attachment previews
- OCR entry points

### SpeechServices
- dictation session lifecycle
- speech-to-text integrations
- permission and capability handling

### CanvasKit
- high-performance drawing and compositing surfaces
- future canvas-specific logic

### DesignSystem
- color, typography, spacing, materials
- reusable controls and layout primitives
- style consistency across modules

## Key architectural rules

### Rule 1: UI code must not own core editing logic
Editing logic belongs in `EditorCore`, not in arbitrary views.

### Rule 2: Workspace logic must not assume one-window usage
Design for multiple windows and documents from the start.

### Rule 3: AI providers must be replaceable
No provider-specific behavior should leak across the app without intentional adapters.

### Rule 4: Rendering-heavy surfaces must be isolated
If Metal is introduced, it must be encapsulated in `CanvasKit` or similarly narrow modules.

### Rule 5: File integrity beats convenience
The app must respect external file edits, rename events, and coordination realities.

## Concurrency strategy

- use async/await for asynchronous workflows
- keep indexing and file scans off the main thread
- make all long-running operations cancelable
- ensure AI requests do not block UI responsiveness
- isolate expensive parsing and rendering work appropriately

## Extensibility strategy

The architecture should make it possible later to add:
- richer local AI workflows
- graph or canvas features
- plugin-like action systems
- iPad adaptation of selected modules

without rewriting the core editor or workspace foundation.
