import { EditorState, StateField, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

// =============================================================================
// Focus State Tracking (purrmd pattern)
// =============================================================================
// Tracks whether the editor has focus. Used by isSelectRange to reveal all
// syntax when editor is unfocused (better for reading/previewing).
// =============================================================================

/**
 * StateField that tracks editor focus state.
 * Updated via custom user events dispatched by focusListener.
 */
export const focusState = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    if (tr.isUserEvent('cm-focus')) return true;
    if (tr.isUserEvent('cm-blur')) return false;
    return value;
  },
});

/**
 * Listener that dispatches focus/blur events via rAF to avoid sync issues.
 * Must be included in the extension array for focus tracking to work.
 */
export const focusListener = EditorView.updateListener.of((update) => {
  if (update.focusChanged) {
    requestAnimationFrame(() => {
      update.view.dispatch({
        userEvent: update.view.hasFocus ? 'cm-focus' : 'cm-blur',
      });
    });
  }
});

/**
 * Check if the editor currently has focus.
 */
export function hasFocus(state: EditorState): boolean {
  return state.field(focusState, false) ?? false;
}

/**
 * Check if a transaction is a focus-related event (cm-focus or cm-blur).
 * Used by StateFields to trigger rebuilds on focus changes.
 */
export function isFocusEvent(tr: Transaction): boolean {
  return tr.isUserEvent('cm-focus') || tr.isUserEvent('cm-blur');
}

// =============================================================================
// Selection Range Checking (purrmd pattern)
// =============================================================================

export interface BaseRange {
  from: number;
  to: number;
}

/**
 * purrmd-style selection overlap check.
 * Returns true if ANY selection range overlaps with the given range.
 * Returns false if editor is unfocused (reveals all syntax for reading).
 *
 * Key difference from cursorInRange:
 * - cursorInRange: only checks cursor head position
 * - isSelectRange: checks full selection overlap + focus state
 */
export function isSelectRange(state: EditorState, range: BaseRange): boolean {
  if (!hasFocus(state)) return false;
  return state.selection.ranges.some(
    (r) => range.from <= r.to && range.to >= r.from
  );
}

/**
 * Check if cursor is on the same line as the given position.
 * When true, markdown syntax should be revealed (not hidden).
 */
export function cursorOnLine(state: EditorState, pos: number): boolean {
  const sel = state.selection;
  const targetLine = state.doc.lineAt(Math.min(pos, state.doc.length)).number;
  for (const range of sel.ranges) {
    if (state.doc.lineAt(range.head).number === targetLine) return true;
  }
  return false;
}

/**
 * Check if cursor is anywhere within the given document range (from..to).
 * @deprecated Use isSelectRange instead for the single-phase pattern.
 */
export function cursorInRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    const head = range.head;
    if (head >= from && head <= to) return true;
  }
  return false;
}

/**
 * purrmd-style line-based selection overlap check.
 * Returns true if ANY selection range overlaps with the given line range.
 * Returns false if editor is unfocused (reveals all syntax for reading).
 *
 * Used for line-based elements like blockquotes where we want to reveal
 * syntax when the cursor is anywhere on the same line(s).
 */
export function isSelectLine(state: EditorState, from: number, to: number): boolean {
  if (!hasFocus(state)) return false;
  const doc = state.doc;
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(to).number;
  return state.selection.ranges.some((r) => {
    const rFromLine = doc.lineAt(r.from).number;
    const rToLine = doc.lineAt(r.to).number;
    return rFromLine <= toLine && rToLine >= fromLine;
  });
}
