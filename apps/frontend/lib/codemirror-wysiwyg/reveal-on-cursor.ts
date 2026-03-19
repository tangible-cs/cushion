import { EditorState, StateField, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export const focusState = StateField.define<boolean>({
  create: () => false,
  update: (value, tr) => {
    if (tr.isUserEvent('cm-focus')) return true;
    if (tr.isUserEvent('cm-blur')) return false;
    return value;
  },
});

export const focusListener = EditorView.updateListener.of((update) => {
  if (update.focusChanged) {
    requestAnimationFrame(() => {
      update.view.dispatch({
        userEvent: update.view.hasFocus ? 'cm-focus' : 'cm-blur',
      });
    });
  }
});

export function hasFocus(state: EditorState): boolean {
  return state.field(focusState, false) ?? false;
}

export function isFocusEvent(tr: Transaction): boolean {
  return tr.isUserEvent('cm-focus') || tr.isUserEvent('cm-blur');
}

export interface BaseRange {
  from: number;
  to: number;
}

export function isSelectRange(state: EditorState, range: BaseRange): boolean {
  if (!hasFocus(state)) return false;
  return state.selection.ranges.some((r) => {
    if (r.empty) {
      return r.head >= range.from && r.head <= range.to;
    }
    const headInside = r.head >= range.from && r.head <= range.to;
    const anchorInside = r.anchor >= range.from && r.anchor <= range.to;
    return headInside || anchorInside;
  });
}

export function isSelectLine(state: EditorState, from: number, to: number): boolean {
  if (!hasFocus(state)) return false;
  const doc = state.doc;
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(to).number;
  return state.selection.ranges.some((r) => {
    if (r.empty) {
      const headLine = doc.lineAt(r.head).number;
      return headLine >= fromLine && headLine <= toLine;
    }
    const headLine = doc.lineAt(r.head).number;
    const anchorLine = doc.lineAt(r.anchor).number;
    const headOnLine = headLine >= fromLine && headLine <= toLine;
    const anchorOnLine = anchorLine >= fromLine && anchorLine <= toLine;
    return headOnLine || anchorOnLine;
  });
}
