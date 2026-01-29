import { EditorState } from '@codemirror/state';

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
 */
export function cursorInRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    const head = range.head;
    if (head >= from && head <= to) return true;
  }
  return false;
}
