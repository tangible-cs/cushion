# Current Product Map

This document captures the known current Cushion product shape to guide the native rewrite.

## Known product identity

Cushion is a local-first markdown workspace with embedded AI workflows and adjacent productivity features.

## Current known capabilities to validate and refine

### Workspace and files
- local workspace orientation
- markdown-centric file browsing
- file-based usage model

### Editing
- markdown editing
- WYSIWYG-like presentation of markdown
- CodeMirror-based current editor stack
- behavior that reduces syntax noise outside the active editing context

### AI
- AI sidebar
- integrated chat or assistant workflows
- OpenCode-related provider or orchestration model

### Additional content types and features
- PDF viewing
- Excalidraw support or integration
- local dictation via Sherpa ONNX
- possible NotebookLM-style or related exploration concepts

### Product/platform notes
- current implementation is Electron and TypeScript based
- current testing emphasis appears to be Windows and Linux
- macOS support exists only weakly or informally and is not first-class

## Questions for discovery

The rewrite effort should validate and document:

1. Which current features are daily-use core versus edge value?
2. Which current interactions feel essential versus incidental?
3. Which features are artifacts of the web architecture rather than user value?
4. Which platform assumptions break on macOS?
5. Which current features should be redesigned instead of copied?

## Parity buckets

### Must preserve in spirit
- local-first trust
- markdown workflow
- integrated AI assistance
- workspace/file orientation

### Must improve materially
- startup and runtime performance
- memory footprint
- Mac-native ergonomics
- multi-window behavior
- menu and shortcut integration
- native feel of previews and dictation

### Optional to defer or redesign
- browser-native canvas or diagram features
- any advanced feature whose current implementation is tightly coupled to web tooling
