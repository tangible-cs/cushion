# Mac Gap Analysis

## Core gap

The current product appears to function primarily as a cross-platform desktop application with strong Windows and Linux viability, but without a deliberate, deeply integrated macOS experience.

The rewrite exists to close that gap.

## Current-state deficits from a Mac perspective

### 1. App feel gap
A wrapped web application rarely matches Mac expectations for menus, commands, settings, focus behavior, multi-window design, and system-level ergonomics.

### 2. Performance profile gap
Electron-style products often carry startup, memory, and idle overhead that native Apple silicon apps can avoid.

### 3. Editing feel gap
A browser-based editor can be good, but it does not automatically inherit the nuanced expectations Mac users have for text handling, input methods, system services, and keyboard feel.

### 4. System integration gap
Native frameworks provide stronger opportunities for:
- PDF workflows
- dictation and speech integration
- file coordination
- Spotlight-friendly metadata
- Quick Look style flows
- accessibility alignment
- appearance and focus behavior

### 5. Trust gap
Mac users often expect document-centric tools to respect files, window states, and local workflows in ways that browser-first tools only partially emulate.

## Rewrite opportunities

### Opportunity 1: become a showcase for Apple silicon efficiency
Use native frameworks, structured concurrency, and selective GPU acceleration to deliver a faster, lighter experience.

### Opportunity 2: build a truly excellent markdown editor
A native TextKit-backed editor can be tailored to the product instead of constrained by browser assumptions.

### Opportunity 3: make AI feel embedded rather than stapled on
A native Mac shell can present AI as contextual assistance rather than as a webpage-style sidebar imitation.

### Opportunity 4: use best-of-breed native adjacent workflows
PDF, OCR, speech, previews, keyboard commands, and multi-window work can all improve materially.

## Design implications

The rewrite should not aim for visual sameness with the existing product. It should aim for preserved purpose and improved native execution.

## Risks to watch

- overcommitting to parity and recreating browser assumptions unnecessarily
- underinvesting in the editor while chasing AI sparkle
- using Metal where standard native drawing would be simpler and better
- introducing hidden data ownership that undermines file trust
- allowing AppKit bridges to become architectural leaks

## Decision summary

The rewrite should prioritize native product quality over shallow feature parity and should be judged by whether Mac users would choose it because it feels built for them.
