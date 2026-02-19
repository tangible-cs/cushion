import {
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
} from '@codemirror/view';
import {
  EditorState,
  StateField,
  StateEffect,
  Range,
  Extension,
} from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { keymap } from '@codemirror/view';

// =============================================================================
// Types
// =============================================================================

interface HeadingInfo {
  level: number;
  lineNumber: number;
  from: number;
  to: number;
}

export interface FoldableHeadingInfo {
  level: number;
  lineNumber: number;
  hasFoldRange: boolean;
}

export type HeadingFoldLookup = Map<number, FoldableHeadingInfo>;

// =============================================================================
// State Effects
// =============================================================================

/** Effect to toggle fold state for a heading at a specific line number */
export const toggleHeadingFoldEffect = StateEffect.define<{ lineNumber: number }>();

/** Effect to set all folded headings at once (for bulk operations) */
export const setHeadingFoldsEffect = StateEffect.define<Set<number>>();

// =============================================================================
// Folded Content Widget
// =============================================================================

/**
 * Widget that replaces folded content.
 * This is invisible - the "..." indicator is shown via CSS on the heading line.
 * Using a widget instead of display:none avoids CodeMirror position tracking issues.
 */
class FoldedContentWidget extends WidgetType {
  constructor(readonly lineCount: number) {
    super();
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-folded-content-widget';
    // Widget is invisible - indicator is on heading via ::after
    return span;
  }

  eq(other: FoldedContentWidget) {
    return this.lineCount === other.lineCount;
  }

  get estimatedHeight() {
    return 0;
  }

  ignoreEvent() {
    return false;
  }
}

// =============================================================================
// State Field - Tracks which headings are folded (by line number)
// =============================================================================

export const headingFoldState = StateField.define<Set<number>>({
  create() {
    return new Set<number>();
  },
  update(foldedLines, tr) {
    // Handle explicit set operation
    for (const effect of tr.effects) {
      if (effect.is(setHeadingFoldsEffect)) {
        return effect.value;
      }
    }

    // Handle toggle operations
    let changed = false;
    let newSet = foldedLines;

    for (const effect of tr.effects) {
      if (effect.is(toggleHeadingFoldEffect)) {
        if (!changed) {
          newSet = new Set(foldedLines);
          changed = true;
        }
        const lineNum = effect.value.lineNumber;
        if (newSet.has(lineNum)) {
          newSet.delete(lineNum);
        } else {
          newSet.add(lineNum);
        }
      }
    }

    // If document changed, remap line numbers
    if (tr.docChanged && foldedLines.size > 0) {
      const remapped = new Set<number>();
      for (const oldLineNum of foldedLines) {
        try {
          const oldLine = tr.startState.doc.line(oldLineNum);
          const newPos = tr.changes.mapPos(oldLine.from, 1);
          if (newPos < tr.state.doc.length) {
            const newLineNum = tr.state.doc.lineAt(newPos).number;
            remapped.add(newLineNum);
          }
        } catch {
          // Line no longer exists, skip it
        }
      }
      return remapped;
    }

    return newSet;
  },
});

// =============================================================================
// Heading Detection
// =============================================================================

/**
 * Finds all ATX headings (# H1 through ###### H6) in the document.
 */
function findAllHeadings(state: EditorState): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      const type = node.type.name;
      if (/^ATXHeading[1-6]$/.test(type)) {
        const level = parseInt(type.charAt(type.length - 1), 10);
        const lineNumber = state.doc.lineAt(node.from).number;
        headings.push({
          level,
          lineNumber,
          from: node.from,
          to: node.to,
        });
      }
    },
  });

  return headings;
}

/**
 * Calculate the fold range for a heading.
 * Returns the range of lines to hide (exclusive of the heading line itself).
 * Returns null if there's nothing to fold.
 */
function calculateFoldRange(
  heading: HeadingInfo,
  allHeadings: HeadingInfo[],
  state: EditorState
): { fromLine: number; toLine: number } | null {
  const headingIdx = allHeadings.findIndex(h => h.lineNumber === heading.lineNumber);
  if (headingIdx === -1) return null;

  const startLine = heading.lineNumber + 1;
  const docLines = state.doc.lines;

  if (startLine > docLines) return null;

  let endLine = docLines;
  for (let i = headingIdx + 1; i < allHeadings.length; i++) {
    const nextHeading = allHeadings[i];
    if (nextHeading.level <= heading.level) {
      endLine = nextHeading.lineNumber - 1;
      break;
    }
  }

  if (endLine < startLine) return null;

  return { fromLine: startLine, toLine: endLine };
}

// =============================================================================
// Foldable Heading Lookup StateField
// =============================================================================

function buildHeadingFoldLookup(state: EditorState): HeadingFoldLookup {
  const lookup: HeadingFoldLookup = new Map();
  const allHeadings = findAllHeadings(state);

  for (const heading of allHeadings) {
    const foldRange = calculateFoldRange(heading, allHeadings, state);
    lookup.set(heading.lineNumber, {
      level: heading.level,
      lineNumber: heading.lineNumber,
      hasFoldRange: Boolean(foldRange),
    });
  }

  return lookup;
}

export const headingFoldInfoField = StateField.define<HeadingFoldLookup>({
  create(state) {
    return buildHeadingFoldLookup(state);
  },
  update(value, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (tr.docChanged || treeChanged) {
      return buildHeadingFoldLookup(tr.state);
    }
    return value;
  },
});

// =============================================================================
// Decorations StateField
// =============================================================================

/**
 * Builds decorations for heading fold:
 * - Line decorations: cm-heading-foldable, cm-heading-folded on heading lines
 * - Replace decorations: Replaces folded content with invisible widget
 *
 * Using Decoration.replace instead of display:none avoids CodeMirror's
 * "Invalid child in posBefore" errors when clicking near folded content.
 */
function buildHeadingFoldDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const foldedLines = state.field(headingFoldState);
  const allHeadings = findAllHeadings(state);

  for (const heading of allHeadings) {
    const foldRange = calculateFoldRange(heading, allHeadings, state);

    if (foldRange) {
      const isFolded = foldedLines.has(heading.lineNumber);
      const headingLine = state.doc.line(heading.lineNumber);

      // Line decoration for the heading itself
      const classes = ['cm-heading-foldable'];
      if (isFolded) {
        classes.push('cm-heading-folded');
      }

      decorations.push(
        Decoration.line({
          class: classes.join(' '),
          attributes: { 'data-fold-level': String(heading.level) },
        }).range(headingLine.from)
      );

      // If folded, replace the content range with a widget
      if (isFolded) {
        try {
          const startLine = state.doc.line(foldRange.fromLine);
          const endLine = state.doc.line(foldRange.toLine);
          const from = startLine.from;
          const to = endLine.to;
          const lineCount = foldRange.toLine - foldRange.fromLine + 1;

          // Replace the entire folded range with an invisible widget
          decorations.push(
            Decoration.replace({
              widget: new FoldedContentWidget(lineCount),
              block: true,
            }).range(from, to)
          );
        } catch {
          // Lines don't exist, skip
        }
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

export const headingFoldDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildHeadingFoldDecorations(state);
  },
  update(value, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    const foldChanged = tr.effects.some(
      e => e.is(toggleHeadingFoldEffect) || e.is(setHeadingFoldsEffect)
    );

    if (tr.docChanged || foldChanged || treeChanged) {
      return buildHeadingFoldDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// Click Handler
// =============================================================================

/**
 * Click handler for fold chevrons.
 * Simplified since we no longer have hidden DOM elements causing position issues.
 */
export const headingFoldClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    const target = event.target as HTMLElement;

    const lineEl = target.closest('.cm-line');
    if (!lineEl) return false;

    if (!lineEl.classList.contains('cm-heading-foldable')) return false;

    const lineRect = lineEl.getBoundingClientRect();

    // Check if click is in the left margin area (where chevron lives)
    const gutterValue = getComputedStyle(lineEl)
      .getPropertyValue('--md-fold-gutter-width')
      .trim();
    const gutterWidth = Number.parseFloat(gutterValue);
    const marginWidth = Number.isFinite(gutterWidth) && gutterWidth > 0 ? gutterWidth : 32;
    const marginRight = lineRect.left;
    const marginLeft = marginRight - marginWidth;

    if (event.clientX >= marginLeft && event.clientX <= marginRight) {
      try {
        const pos = view.posAtDOM(lineEl);
        if (pos === null || pos === undefined) return false;

        const line = view.state.doc.lineAt(pos);

        view.dispatch({
          effects: toggleHeadingFoldEffect.of({ lineNumber: line.number }),
        });

        event.preventDefault();
        return true;
      } catch {
        return false;
      }
    }

    return false;
  },
});

// =============================================================================
// Keyboard Commands
// =============================================================================

function toggleFoldAtCursor(view: EditorView): boolean {
  const state = view.state;
  const pos = state.selection.main.head;
  const lineNumber = state.doc.lineAt(pos).number;

  const allHeadings = findAllHeadings(state);
  const heading = allHeadings.find(h => h.lineNumber === lineNumber);

  if (heading) {
    const foldRange = calculateFoldRange(heading, allHeadings, state);
    if (foldRange) {
      view.dispatch({
        effects: toggleHeadingFoldEffect.of({ lineNumber }),
      });
      return true;
    }
  }

  return false;
}

function foldAtCursor(view: EditorView): boolean {
  const state = view.state;
  const pos = state.selection.main.head;
  const lineNumber = state.doc.lineAt(pos).number;
  const foldedLines = state.field(headingFoldState);

  if (foldedLines.has(lineNumber)) return false;

  const allHeadings = findAllHeadings(state);
  const heading = allHeadings.find(h => h.lineNumber === lineNumber);

  if (heading) {
    const foldRange = calculateFoldRange(heading, allHeadings, state);
    if (foldRange) {
      view.dispatch({
        effects: toggleHeadingFoldEffect.of({ lineNumber }),
      });
      return true;
    }
  }

  return false;
}

function unfoldAtCursor(view: EditorView): boolean {
  const state = view.state;
  const pos = state.selection.main.head;
  const lineNumber = state.doc.lineAt(pos).number;
  const foldedLines = state.field(headingFoldState);

  if (!foldedLines.has(lineNumber)) return false;

  view.dispatch({
    effects: toggleHeadingFoldEffect.of({ lineNumber }),
  });
  return true;
}

export function foldAllHeadings(view: EditorView): boolean {
  const state = view.state;
  const allHeadings = findAllHeadings(state);
  const toFold = new Set<number>();

  for (const heading of allHeadings) {
    const foldRange = calculateFoldRange(heading, allHeadings, state);
    if (foldRange) {
      toFold.add(heading.lineNumber);
    }
  }

  if (toFold.size > 0) {
    view.dispatch({
      effects: setHeadingFoldsEffect.of(toFold),
    });
    return true;
  }

  return false;
}

export function unfoldAllHeadings(view: EditorView): boolean {
  const state = view.state;
  const foldedLines = state.field(headingFoldState);

  if (foldedLines.size > 0) {
    view.dispatch({
      effects: setHeadingFoldsEffect.of(new Set()),
    });
    return true;
  }

  return false;
}

export function toggleHeadingFold(view: EditorView, lineNumber: number): boolean {
  view.dispatch({
    effects: toggleHeadingFoldEffect.of({ lineNumber }),
  });
  return true;
}

// =============================================================================
// Keymap
// =============================================================================

export const headingFoldKeymap = keymap.of([
  { key: 'Ctrl-Shift-[', run: foldAtCursor },
  { key: 'Ctrl-Shift-]', run: unfoldAtCursor },
  { key: 'Ctrl-Shift-\\', run: toggleFoldAtCursor },
]);

// =============================================================================
// Extension Bundle
// =============================================================================

export function headingFoldExtension(): Extension {
  return [
    headingFoldState,
    headingFoldInfoField,
    headingFoldDecorationsField,
    headingFoldClickHandler,
    headingFoldKeymap,
  ];
}
