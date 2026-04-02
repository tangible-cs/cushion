# Testing Strategy

## Principle

TDD is not optional. Tests are written before or alongside implementation code, not afterward. A feature is not complete until its tests pass and its coverage meets the module threshold.

The test suite exists to encode product intent, not to satisfy a metric. Every test should represent a behavior someone cares about.

## Testing methodology

### Red → Green → Refactor

1. Write a failing test that describes the intended behavior.
2. Write the minimum implementation to make it pass.
3. Refactor the implementation without breaking the test.

This cycle applies to all non-trivial logic in every module. It is the expected workflow for agents and contributors.

### Protocol-first design for testability

- Service boundaries must be expressed as protocols.
- Concrete implementations are injected, not hardcoded.
- Tests use lightweight fakes or stubs, not framework mocks.
- No test should reach the real filesystem, network, or AI provider unless it is an explicitly labeled integration test.

## Testing frameworks

### Primary: Swift Testing
Use Apple's `swift-testing` framework (`@Test`, `@Suite`) as the default for all new test code.

- expressive and readable test declarations
- native parameterized tests with `@Test(arguments:)`
- structured test organization with `@Suite`
- works alongside XCTest and runs in the same Xcode test product

### Secondary: XCTest
Use XCTest where Swift Testing is not yet adequate:

- performance measurement via `measure {}` blocks
- XCUITest for UI automation flows
- any compatibility need with existing tooling

### UI automation: XCUITest
Smoke-test critical end-to-end flows:

- open workspace → navigate to file → edit → relaunch with state restored
- AI request → streaming response → cancellation
- find/replace across document

UI tests are expensive; keep the suite targeted and fast.

## Test pyramid

```
         [XCUITest]
        critical flows
       ─────────────────
      [XCTest / Integration]
     file workflows, SwiftData,
     workspace state, AI adapter seams
    ───────────────────────────────────
   [Swift Testing / Unit]
  pure logic, parsing, transforms,
  document model, state machines,
  DesignSystem snapshot assertions
 ────────────────────────────────────────
```

The unit base should be the largest tier. UI tests should be the smallest.

## Coverage requirements

Coverage is measured per module and enforced as a floor, not a ceiling. Falling below threshold blocks a phase from closing.

| Module          | Minimum coverage |
|-----------------|-----------------|
| EditorCore      | 85%             |
| WorkspaceCore   | 80%             |
| AIClient        | 80%             |
| SpeechServices  | 70%             |
| FilePreview     | 70%             |
| DesignSystem    | 65%             |
| CanvasKit       | 60%             |
| CushionApp      | 60%             |

Coverage is measured via Xcode's built-in code coverage tooling (`xccov`) or equivalent CI-compatible extraction.

Coverage must not regress between phases. A PR that drops a module below its current baseline must not be merged without documented justification.

## Quality gates

All of the following must pass before a phase is considered closed or a change merged.

### Build

- Zero build errors.
- Zero build warnings in production targets. Treat warnings as errors (`SWIFT_TREAT_WARNINGS_AS_ERRORS = YES`) for all non-test targets.

### Linting

- SwiftLint must pass with the project's `.swiftlint.yml` configuration.
- No disabled rules without a comment explaining why.
- Lint runs on every CI pass.

### Tests

- All tests must pass.
- No tests may be marked `skip` or disabled without a tracking note explaining the condition and when it will be resolved.

### Coverage

- Module coverage floors must be met (see table above).
- Coverage report must be generated and inspected at the close of each phase.

### Performance baselines

- XCTest `measure {}` baselines must be set for:
  - markdown document parsing (small, medium, large fixtures)
  - workspace indexing
  - file tree rendering
  - editor open time
- Baselines are committed alongside implementation code.
- A 10% or greater regression in a baseline triggers investigation before merge.

## Test organization per module

Each Swift package has:

```
ModuleName/
  Sources/
    ModuleName/
      ...
  Tests/
    ModuleNameTests/
      Unit/          # Swift Testing, pure logic
      Integration/   # XCTest, real file I/O or framework coordination
      Fixtures/      # shared test data and helper types
      Snapshots/     # snapshot baselines where applicable
```

Integration tests that require the filesystem must use temporary directories created in `setUp` and torn down in `tearDown`.

## Snapshot testing

Used for high-value DesignSystem components and editor rendering states.

- snapshot baseline images are committed to the repo under `Tests/Snapshots/`
- snapshots are recorded on a canonical device/scale configuration
- a snapshot diff blocks CI until the baseline is intentionally updated
- use Apple's native screenshot APIs or a lightweight wrapper; avoid heavyweight third-party snapshot frameworks unless there is a clear need

## Fixtures and test data

- canonical markdown fixture files live in `Tests/Fixtures/` per module
- fixture files cover: empty document, small document, large document (>50k characters), documents with all major syntax elements
- fixture files are plain text and human-readable
- no generated binary fixtures without justification

## What must always have tests

- every parser, tokenizer, or transformation in EditorCore
- every file coordination path in WorkspaceCore
- every provider adapter contract in AIClient
- every state machine or observable model that drives UI
- every error condition that a user would see or that could corrupt data
- every performance-sensitive path with a baseline

## What does not need tests

- SwiftUI view layout that has no logic
- AppKit bridge wiring that wraps a single framework call with no branching
- trivial computed properties that delegate entirely to a framework type

Use judgment. If a piece of code can fail in a way that hurts users, it needs a test.

## Regression prevention

- no new feature without a corresponding test
- no bug fix without a test that would have caught the bug
- coverage reports are reviewed at the end of every phase, not just at shipping
- performance baselines are re-evaluated when the underlying code changes materially

## CI requirements

Every push to a feature or phase branch must run:

1. `xcodebuild test` across all module test targets
2. SwiftLint
3. Code coverage extraction and threshold check
4. Performance baseline comparison (warn on regression, fail on severe regression)

These checks are not optional and must not be bypassed.
