import {
  Annotation,
  EditorState,
  MapMode,
  Prec,
  StateField,
  Transaction,
  type ChangeSpec,
  type Range,
} from '@codemirror/state';
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  keymap,
} from '@codemirror/view';
import { defaultKeymap, undo, redo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import {
  moveNextCell, movePrevCell, moveNextRow, movePrevRow,
  addRowAfter, addRowBefore, addColAfter, addColBefore,
  exitTableUp, exitTableDown,
} from './table-commands';

export const syncAnnotation = Annotation.define<boolean>();

function buildSyncAnnotations(tr: Transaction): Annotation<unknown>[] {
  const annotations: Annotation<unknown>[] = [syncAnnotation.of(true)];
  const userEvent = tr.annotation(Transaction.userEvent);
  if (userEvent !== undefined) {
    annotations.push(Transaction.userEvent.of(userEvent));
  }
  return annotations;
}

export function dispatchFromSubview(mainView: EditorView): (tr: Transaction, subview: EditorView) => void {
  return (tr: Transaction, subview: EditorView) => {
    subview.update([tr]);
    if (tr.annotation(syncAnnotation) === undefined && (tr.docChanged || tr.effects.length > 0)) {
      mainView.dispatch(tr, { annotations: buildSyncAnnotations(tr) });
    }
  };
}

export function maybeDispatchToSubview(subview: EditorView, tr: Transaction): void {
  if (tr.annotation(syncAnnotation) === undefined && (tr.docChanged || tr.effects.length > 0)) {
    subview.dispatch(tr, { annotations: buildSyncAnnotations(tr) });
  }
}

interface HiddenSpanState {
  decorations: DecorationSet;
  cellRange: [number, number];
}

export const hiddenSpanField = StateField.define<HiddenSpanState>({
  create(state) {
    return { decorations: Decoration.none, cellRange: [0, state.doc.length] };
  },
  update(value, tr) {
    if (!tr.docChanged) return value;
    return {
      decorations: value.decorations.map(tr.changes),
      cellRange: [
        tr.changes.mapPos(value.cellRange[0], -1),
        tr.changes.mapPos(value.cellRange[1], 1),
      ],
    };
  },
  provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
});

function createHiddenDecorations(
  state: EditorState,
  cellRange: { from: number; to: number },
): DecorationSet {
  const line = state.doc.lineAt(cellRange.from);
  const decorations: Range<Decoration>[] = [];

  if (line.from - 1 > 0) {
    decorations.push(
      Decoration.replace({ block: true, inclusive: true }).range(0, line.from - 1),
    );
  }
  if (cellRange.from > line.from) {
    decorations.push(
      Decoration.replace({ block: false, inclusive: false }).range(line.from, cellRange.from),
    );
  }
  if (line.to > cellRange.to) {
    decorations.push(
      Decoration.replace({ block: false, inclusive: false }).range(cellRange.to, line.to),
    );
  }
  if (state.doc.length > line.to + 1) {
    decorations.push(
      Decoration.replace({ block: true, inclusive: true }).range(line.to + 1, state.doc.length),
    );
  }

  return Decoration.set(decorations);
}

const ensureBoundariesFilter = EditorState.transactionFilter.of((tr) => {
  if (tr.annotation(syncAnnotation) === true) return tr;

  const [cellFrom, cellTo] = tr.startState.field(hiddenSpanField).cellRange;

  if (tr.selection !== undefined) {
    const { from, to } = tr.selection.main;
    const mappedFrom = tr.changes.mapPos(cellFrom, -1, MapMode.TrackBefore);
    const mappedTo = tr.changes.mapPos(cellTo, 1, MapMode.TrackAfter);
    const wasDeleted = mappedFrom === null || mappedTo === null;
    if (wasDeleted || from < mappedFrom || to > mappedTo) {
      return [];
    }
  }

  if (!tr.docChanged) return tr;

  const safeChanges: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    if (fromA >= cellFrom && toA <= cellTo) {
      safeChanges.push({ from: fromA, to: toA, insert: inserted.toString().replace(/\n+/g, ' ') });
    }
  });

  return { ...tr, changes: safeChanges };
});

function maybeEscape(
  mainView: EditorView,
  unit: 'char' | 'line',
  dir: -1 | 1,
): (subview: EditorView) => boolean {
  return (subview: EditorView): boolean => {
    const { main } = subview.state.selection;
    if (!main.empty) return false;

    const [cellFrom, cellTo] = subview.state.field(hiddenSpanField).cellRange;

    if (unit === 'char') {
      if (dir < 0 && main.head > cellFrom) return false;
      if (dir > 0 && main.head < cellTo) return false;
      if (dir > 0) return moveNextCell(mainView, { cursorPos: 'start', autoAddRow: false });
      return movePrevCell(mainView, { cursorPos: 'end', autoAddRow: false });
    }

    if (unit === 'line') {
      if (dir > 0) {
        const moved = moveNextRow(mainView, { autoAddRow: false });
        if (!moved) return exitTableDown(mainView);
        return true;
      }
      const moved = movePrevRow(mainView);
      if (!moved) return exitTableUp(mainView);
      return true;
    }

    return false;
  };
}

function tableNavigationKeymap(mainView: EditorView) {
  return keymap.of([
    { key: 'Tab', run: () => moveNextCell(mainView) },
    { key: 'Shift-Tab', run: () => movePrevCell(mainView) },
    { key: 'Enter', run: () => moveNextRow(mainView) },
    { key: 'Shift-Enter', run: () => { movePrevRow(mainView); return true; } },
    { key: 'Ctrl-Enter', run: () => true },
    { key: 'Mod-Enter', run: () => true },
    { key: 'ArrowRight', run: maybeEscape(mainView, 'char', 1) },
    { key: 'ArrowLeft', run: maybeEscape(mainView, 'char', -1) },
    { key: 'ArrowDown', run: maybeEscape(mainView, 'line', 1) },
    { key: 'ArrowUp', run: maybeEscape(mainView, 'line', -1) },
    { key: 'Alt-ArrowDown', run: () => addRowAfter(mainView) },
    { key: 'Alt-ArrowUp', run: () => addRowBefore(mainView) },
    { key: 'Alt-ArrowRight', run: () => addColAfter(mainView) },
    { key: 'Alt-ArrowLeft', run: () => addColBefore(mainView) },
    {
      key: 'Escape',
      run: () => exitTableDown(mainView),
    },
    {
      key: 'Mod-a',
      run: (subview) => {
        const [cellFrom, cellTo] = subview.state.field(hiddenSpanField).cellRange;
        subview.dispatch({ selection: { anchor: cellFrom, head: cellTo } });
        return true;
      },
    },
    { key: 'Mod-z', run: () => { undo(mainView); return true; } },
    { key: 'Mod-Shift-z', run: () => { redo(mainView); return true; } },
    { key: 'Mod-y', run: () => { redo(mainView); return true; } },
  ]);
}

export function createSubviewForCell(
  mainView: EditorView,
  contentWrapper: HTMLDivElement,
  cellRange: { from: number; to: number },
): void {
  const state = EditorState.create({
    doc: mainView.state.sliceDoc(),
    selection: mainView.state.selection,
    extensions: [
      keymap.of(defaultKeymap),
      Prec.highest(tableNavigationKeymap(mainView)),
      drawSelection({ drawRangeCursor: false, cursorBlinkRate: 1000 }),
      EditorView.lineWrapping,
      hiddenSpanField.init((s) => ({
        decorations: createHiddenDecorations(s, cellRange),
        cellRange: [cellRange.from, cellRange.to],
      })),
      ensureBoundariesFilter,
      EditorView.theme({
        '&': { backgroundColor: 'transparent', height: 'fit-content', overflow: 'hidden' },
        '.cm-content': {
          padding: '0 !important',
          minHeight: '0 !important',
          caretColor: 'var(--md-text)',
        },
        '.cm-scroller': { padding: '0', overflow: 'hidden', minHeight: '0 !important' },
        '.cm-line': { padding: '0' },
        '.cm-gap': { display: 'none !important' },
        '.cm-focused': { outline: 'none' },
        '.cm-selectionBackground': { backgroundColor: 'var(--md-selection-bg) !important' },
      }),
    ],
  });

  const subview = new EditorView({
    state,
    parent: contentWrapper,
    dispatch: dispatchFromSubview(mainView),
  });

  setTimeout(() => subview.focus(), 0);
}

export const subviewUpdatePlugin = ViewPlugin.define((view) => ({
  update(u: ViewUpdate) {
    const cells = [
      ...view.dom.querySelectorAll('.cm-table-widget td'),
      ...view.dom.querySelectorAll('.cm-table-widget th'),
    ] as HTMLTableCellElement[];

    for (const cell of cells) {
      const contentEl = cell.querySelector('div.content') as HTMLElement | null;
      if (!contentEl) continue;
      const subview = EditorView.findFromDOM(contentEl);
      if (subview !== null) {
        for (const tr of u.transactions) {
          maybeDispatchToSubview(subview, tr);
        }
      }
    }
  },
}));
