import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { StateField, StateEffect, Facet } from '@codemirror/state';

/**
 * Focus mode for markdown editor.
 * When enabled, lines without the cursor are faded out,
 * creating a distraction-free writing experience.
 */

// Effect to toggle focus mode
export const toggleFocusMode = StateEffect.define<boolean>();

// State field to track focus mode state
export const focusModeState = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleFocusMode)) {
        return effect.value;
      }
    }
    return value;
  },
});

// Facet to configure focus mode range (how many lines around cursor stay focused)
export const focusModeRange = Facet.define<number, number>({
  combine: values => values.length ? values[0] : 3, // Default: 3 lines above and below
});

/**
 * Builds decorations for focus mode.
 * Lines far from the cursor get a "faded" class.
 */
function buildFocusDecorations(view: EditorView): DecorationSet {
  const isFocusMode = view.state.field(focusModeState);
  if (!isFocusMode) {
    return Decoration.none;
  }

  const decorations: ReturnType<typeof Decoration.line>[] = [];
  const { doc, selection } = view.state;
  const cursorLine = doc.lineAt(selection.main.head).number;
  const range = view.state.facet(focusModeRange);

  // Get all line numbers
  const totalLines = doc.lines;

  for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
    const distance = Math.abs(lineNum - cursorLine);
    
    if (distance > range) {
      const line = doc.line(lineNum);
      // Calculate opacity based on distance (further = more faded)
      const opacity = Math.max(0.3, 1 - (distance - range) * 0.1);
      
      decorations.push(
        Decoration.line({
          class: 'cm-focus-faded',
          attributes: {
            style: `opacity: ${opacity};`,
          },
        }).range(line.from)
      );
    }
  }

  return Decoration.set(decorations);
}

/**
 * View plugin that manages focus mode decorations.
 */
const focusModePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildFocusDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.selectionSet ||
        update.docChanged ||
        update.state.field(focusModeState) !== update.startState.field(focusModeState)
      ) {
        this.decorations = buildFocusDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

/**
 * Theme additions for focus mode.
 */
const focusModeTheme = EditorView.baseTheme({
  '.cm-focus-faded': {
    transition: 'opacity 0.3s ease',
  },
  '&.cm-editor.focus-mode-active': {
    // Additional styling when focus mode is active
  },
});

/**
 * View plugin that adds/removes the focus-mode-active class on the editor.
 */
const focusModeClassPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.updateClass(view);
    }

    update(update: ViewUpdate) {
      if (update.state.field(focusModeState) !== update.startState.field(focusModeState)) {
        this.updateClass(update.view);
      }
    }

    updateClass(view: EditorView) {
      const isFocusMode = view.state.field(focusModeState);
      const editorEl = view.dom;
      
      if (isFocusMode) {
        editorEl.classList.add('focus-mode-active');
      } else {
        editorEl.classList.remove('focus-mode-active');
      }
    }
  }
);

/**
 * Focus mode extension.
 * Add this to your editor extensions to enable focus mode functionality.
 * Use toggleFocusMode effect to enable/disable.
 * 
 * @example
 * ```ts
 * // Toggle focus mode
 * view.dispatch({
 *   effects: toggleFocusMode.of(true) // or false to disable
 * });
 * ```
 */
export function focusModeExtension(initialEnabled = false) {
  return [
    focusModeState,
    focusModeRange.of(3),
    focusModePlugin,
    focusModeClassPlugin,
    focusModeTheme,
    // Initialize with given state
    EditorView.updateListener.of((update) => {
      // Could be used for analytics or state persistence
    }),
  ];
}

/**
 * Helper function to toggle focus mode on an EditorView.
 */
export function setFocusMode(view: EditorView, enabled: boolean) {
  view.dispatch({
    effects: toggleFocusMode.of(enabled),
  });
}

/**
 * Helper function to check if focus mode is currently enabled.
 */
export function isFocusModeEnabled(view: EditorView): boolean {
  return view.state.field(focusModeState);
}
