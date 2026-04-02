# Cushion for Mac

Cushion for Mac is a native Apple silicon rewrite of Cushion designed to make local-first markdown workspaces feel deeply at home on macOS.

This project is not a wrapper around the existing desktop application. It is a native re-architecture built with SwiftUI, AppKit interoperability where needed, file-first workspace management, a high-performance markdown editing engine, and a modular AI service layer.

## Goals

- Build a first-class native Mac writing and thinking environment
- Preserve local-first trust and markdown portability
- Deliver a superior editing experience to the existing Electron-based app
- Integrate AI in a way that feels fast, private where appropriate, and optional
- Optimize from day one for Apple silicon performance, battery life, and responsiveness

## Core principles

- SwiftUI-first shell
- Native editor architecture
- File-first and local-first
- Modular design
- AI as an adapter layer
- Metal only where it creates real value
- Mac-native ergonomics over feature parity theater

## Planned modules

- CushionApp
- WorkspaceCore
- EditorCore
- AIClient
- FilePreview
- SpeechServices
- CanvasKit
- DesignSystem

## Delivery approach

The app will be built in phases:

1. Product discovery and planning
2. Native foundation
3. Markdown editor parity and superiority
4. Mac-first pro workflows
5. AI sidebar and assistance layer
6. PDF, speech, and canvas support
7. Performance and Apple silicon polish

## Out of scope for v1

- Reproducing every advanced feature before the editor is excellent
- Rebuilding browser-based diagram tooling without validating native UX value
- Cross-platform abstractions that weaken Mac quality

## Definition of success

A serious markdown-heavy user should prefer Cushion for Mac over the existing app for day-to-day work because it is faster, smoother, more integrated with the OS, and more trustworthy as a Mac-native tool.
