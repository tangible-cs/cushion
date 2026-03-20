import { EditorState, StateField, StateEffect, Transaction } from '@codemirror/state';
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

export const mouseSelectEffect = StateEffect.define<boolean>();

export const mouseSelectingField = StateField.define<boolean>({
  create() { return false; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(mouseSelectEffect)) return e.value;
    }
    return value;
  },
});

export const mouseSelectionTracker = EditorView.domEventHandlers({
  mousedown(_event, view) {
    view.dispatch({ effects: mouseSelectEffect.of(true) });
    const onUp = () => {
      view.dispatch({ effects: mouseSelectEffect.of(false) });
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mouseup', onUp);
    return false;
  },
});

function isMouseSelecting(state: EditorState): boolean {
  return state.field(mouseSelectingField, false) ?? false;
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
    if (isMouseSelecting(state)) return false;
    const selFrom = Math.min(r.head, r.anchor);
    const selTo = Math.max(r.head, r.anchor);
    return selFrom < range.to && selTo > range.from;
  });
}

export function isSelectLine(state: EditorState, from: number, to: number): boolean {
  if (!hasFocus(state)) return false;
  if (isMouseSelecting(state)) return false;
  const doc = state.doc;
  const fromLine = doc.lineAt(from).number;
  const toLine = doc.lineAt(to).number;
  return state.selection.ranges.some((r) => {
    if (r.empty) {
      const headLine = doc.lineAt(r.head).number;
      return headLine >= fromLine && headLine <= toLine;
    }
    const selFromLine = doc.lineAt(Math.min(r.head, r.anchor)).number;
    const selToLine = doc.lineAt(Math.max(r.head, r.anchor)).number;
    return selFromLine <= toLine && selToLine >= fromLine;
  });
}
