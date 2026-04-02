# AGENTS.md

This file defines how Claude Code and other coding agents must operate in this repository.

## Mission

Build Cushion for Mac as a native Apple silicon application with a Mac-first user experience, a modular architecture, and a file-first local-first foundation.

## Required architectural constraints

1. Use SwiftUI for the primary application shell.
2. Use AppKit only through explicit bridge components.
3. Keep user markdown documents as canonical files on disk.
4. Use SwiftData only for metadata, preferences, workspace state, indexes, caches, and AI history.
5. Build a custom native editor architecture. Do not treat SwiftUI TextEditor as the final solution.
6. Do not embed large parts of the legacy web app unless a written exception is approved.
7. Every compatibility island must include:
   - reason for existence
   - module boundary
   - deprecation or replacement plan
8. Use Metal only for rendering-heavy surfaces with measured performance need.
9. Preserve keyboard-first workflows and accessibility in all major features.
10. Favor Apple-native frameworks over third-party abstractions unless there is a compelling reason.

## Spec-first workflow

Before implementation of a major feature, ensure the relevant docs are updated.

Required docs:

- docs/vision.md
- docs/architecture.md
- docs/phases.md
- docs/ux-principles.md
- docs/acceptance-criteria.md
- docs/current-product-map.md
- docs/mac-gap-analysis.md
- docs/testing-strategy.md

## Module boundaries

Agents must respect the intended responsibilities of each module:

- CushionApp: scenes, commands, settings, dependency wiring, app lifecycle
- WorkspaceCore: file coordination, workspace indexing, metadata, recent workspaces, search surfaces
- EditorCore: document model, markdown parsing, editing, syntax presentation, selection model, find/replace
- AIClient: provider abstraction, prompt context, streaming, task orchestration, local-vs-remote routing
- FilePreview: PDF, media, attachment previews, OCR hooks
- SpeechServices: dictation, transcription, speech session handling
- CanvasKit: rendering-heavy views, canvas/minimap/compositing surfaces
- DesignSystem: typography, spacing, color tokens, reusable UI building blocks

## Code quality rules

- Prefer small focused types over giant god objects.
- Favor composition over deep inheritance.
- Use async/await and structured concurrency.
- Avoid hidden shared mutable state.
- Keep file I/O off the main thread.
- Make cancellation behavior explicit for long-running tasks.
- Use protocol-based boundaries at service seams where testing benefits.

## Testing rules

TDD is the required development methodology. See `docs/testing-strategy.md` for the full specification.

Non-negotiable rules for every agent:

1. **Tests before or alongside implementation.** A feature is not complete until its tests exist and pass. Do not write implementation code and then add tests as an afterthought.
2. **Red → Green → Refactor.** Follow the TDD cycle. Write a failing test, implement minimally to pass it, then refactor safely.
3. **No merge without coverage.** Every module has a minimum coverage floor (see testing-strategy.md). Falling below it blocks phase closure.
4. **No skipped tests without a note.** A disabled or skipped test must include a comment with the reason and a condition for re-enabling.
5. **No feature without a regression test.** Every bug fix must include a test that would have caught the bug.
6. **Protocol-first design.** Service boundaries are protocols. Tests use fakes or stubs, not real I/O, unless explicitly labeled as integration tests.
7. **Performance baselines are code.** XCTest `measure {}` baselines for critical paths are committed and enforced. A 10%+ regression requires investigation before merge.
8. **CI must be green.** All tests, lint, coverage thresholds, and performance checks must pass. These are not optional.

Coverage floors by module:

| Module         | Minimum |
|----------------|---------|
| EditorCore     | 85%     |
| WorkspaceCore  | 80%     |
| AIClient       | 80%     |
| SpeechServices | 70%     |
| FilePreview    | 70%     |
| DesignSystem   | 65%     |
| CanvasKit      | 60%     |
| CushionApp     | 60%     |

Coverage must not regress between phases.

## Accessibility rules

- VoiceOver labels and navigation must be meaningful
- keyboard navigation must work without mouse dependency
- dynamic type and contrast should be considered where applicable on macOS
- avoid visual-only state cues when practical

## Performance rules

- main-thread work should be minimized
- large files must open without noticeable freezing
- background indexing must be incremental and cancelable
- rendering-heavy views must have measurable performance goals
- memory use should reflect a native app, not a browser shell

## Pull request expectations for agents

Each change should include:

- purpose of the change
- affected modules
- architectural notes
- risks or tradeoffs
- acceptance checks
- next recommended increment

## Things agents must not do

- silently add dependencies without justification
- mix storage concerns between canonical files and app metadata
- add UI features that bypass the design system without reason
- copy browser-style interaction patterns that feel alien on Mac
- optimize for parity over quality when the native design should differ
