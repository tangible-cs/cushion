import { type DecorationSet, EditorView, keymap } from '@codemirror/view';
import { type EditorState, type Extension, StateField, Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { subviewUpdatePlugin } from './table-subview';
import { TableWidget } from './table-widget';
import { clearSelectedCells } from './table-commands';
import { parseTableNode } from './table-parser';
import { tableCellSelectionField, setTableSelection, getSelectedRange } from './table-selection';

export { tableCellSelectionField, setTableSelection, getSelectedRange } from './table-selection';
export type { TableCellSelection } from './table-selection';

const tableDecorationsField = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return TableWidget.createForState(state);
  },
  update(_, tr) {
    return TableWidget.createForState(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function getTableForSelection(view: EditorView) {
  const sel = view.state.field(tableCellSelectionField);
  if (!sel) return null;

  const tree = syntaxTree(view.state);
  const tableNode = tree.topNode.getChildren('Table').find(
    n => n.from === sel.tableFrom,
  );
  if (!tableNode) return null;

  const table = parseTableNode(tableNode, view.state.sliceDoc());
  if (!table) return null;

  return { table, tableNode, sel };
}

const tableSelectionKeymap = Prec.high(keymap.of([
  {
    key: 'Delete',
    run(view) {
      const sel = view.state.field(tableCellSelectionField);
      if (!sel) return false;
      return clearSelectedCells(view);
    },
  },
  {
    key: 'Backspace',
    run(view) {
      const ctx = getTableForSelection(view);
      if (!ctx) return false;

      const { table, tableNode, sel } = ctx;
      const { minRow, maxRow, minCol, maxCol } = getSelectedRange(sel);

      const isFullRow = minCol === 0 && maxCol === table.columns - 1;
      const isFullCol = minRow === 0 && maxRow === table.rows.length - 1;

      if (isFullRow && isFullCol) {
        const tableStart = view.state.doc.lineAt(table.from).from;
        let tableEnd = table.to;
        if (tableEnd < view.state.doc.length) tableEnd += 1;
        view.dispatch({
          changes: { from: tableStart, to: tableEnd },
          effects: setTableSelection.of(null),
        });
        return true;
      }

      if (isFullRow) {
        const changes: { from: number; to: number; insert?: string }[] = [];
        const dataRowCount = table.rows.length - 1;
        const rowsToDelete = maxRow - Math.max(minRow, 1) + 1;

        for (let r = maxRow; r >= minRow; r--) {
          if (r === 0) {
            table.rows[0].cells
              .filter(c => c.from !== c.to)
              .forEach(c => changes.push({ from: c.from, to: c.to, insert: ' ' }));
            continue;
          }
          if (dataRowCount - rowsToDelete < 1 && r === minRow) continue;
          const row = table.rows[r];
          if (!row) continue;
          const prevLineStart = view.state.doc.lineAt(row.from).from - 1;
          changes.push({ from: Math.max(0, prevLineStart), to: row.to });
        }

        if (changes.length > 0) {
          changes.sort((a, b) => a.from - b.from);
          view.dispatch({ changes, effects: setTableSelection.of(null) });
        }
        return true;
      }

      if (isFullCol) {
        if (table.columns <= 1) return true;
        const doc = view.state.sliceDoc();
        const changes: { from: number; to: number }[] = [];

        for (let c = maxCol; c >= minCol; c--) {
          if (table.columns - (maxCol - minCol + 1) < 1) break;
          let child = tableNode.firstChild;
          while (child) {
            const lineText = doc.slice(child.from, child.to);
            const pipes: number[] = [];
            for (let i = 0; i < lineText.length; i++) {
              if (lineText[i] === '|') pipes.push(i);
            }
            if (pipes.length >= 2 && c + 1 < pipes.length) {
              changes.push({ from: child.from + pipes[c], to: child.from + pipes[c + 1] });
            }
            child = child.nextSibling;
          }
        }

        if (changes.length > 0) {
          changes.sort((a, b) => a.from - b.from);
          view.dispatch({ changes, effects: setTableSelection.of(null) });
        }
        return true;
      }

      return clearSelectedCells(view);
    },
  },
  {
    key: 'Escape',
    run(view) {
      const sel = view.state.field(tableCellSelectionField);
      if (!sel) return false;
      view.dispatch({ effects: setTableSelection.of(null) });
      return true;
    },
  },
]));

const tableTheme = EditorView.baseTheme({
  '.cm-table-widget': {
    maxWidth: 'fit-content',
    padding: '8px 24px 24px 0',
    margin: '4px 0',
    overflow: 'visible',
    position: 'relative',
  },
  '.cm-table-widget table': {
    borderCollapse: 'collapse',
    width: 'auto',
    '& .cm-line': {
      '& ::selection, &::selection': {
        backgroundColor: 'transparent !important',
      },
      caretColor: 'transparent !important',
    },
    '& .cm-content': {
      caretColor: 'transparent !important',
      '& :focus': {
        caretColor: 'initial !important',
        '&::selection, & ::selection': {
          backgroundColor: 'Highlight !important',
        },
      },
    },
  },
  '.cm-table-widget th, .cm-table-widget td': {
    border: '1px solid var(--md-border)',
    padding: '0',
    minWidth: '80px',
    cursor: 'text',
    position: 'relative',
    verticalAlign: 'top',
  },
  '.cm-table-widget th': {
    fontWeight: '600',
    backgroundColor: 'var(--md-bg-secondary, var(--md-code-bg))',
  },
  '.cm-table-widget td': {
    backgroundColor: 'transparent',
  },
  '.cm-table-widget div.content': {
    padding: '6px 10px',
    minHeight: '1.4em',
    lineHeight: 'var(--md-baseline, 1.6)',
    fontSize: 'var(--md-font-size, 16px)',
    fontFamily: 'var(--md-font-family)',
    color: 'var(--md-text)',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  '.cm-table-widget div.content.editing': {
    padding: '6px 10px',
    outline: '2px solid var(--md-accent)',
    outlineOffset: '-2px',
    borderRadius: '0',
  },
  '.cm-table-widget div.content .cm-editor': {
    backgroundColor: 'transparent',
    height: 'fit-content',
    overflow: 'hidden',
  },
  '.cm-table-widget div.content .cm-scroller': {
    padding: '0',
    overflow: 'hidden',
    minHeight: '0 !important',
  },
  '.cm-table-widget div.content .cm-content': {
    padding: '0 !important',
    minHeight: '0 !important',
    maxWidth: 'none',
  },
  '.cm-table-widget div.content .cm-gap': {
    display: 'none !important',
  },
  '.cm-table-widget div.content .cm-line': {
    padding: '0',
  },
  '.cm-table-widget div.content .cm-focused': {
    outline: 'none',
  },
  '.cm-table-add-col-zone': {
    position: 'absolute',
    top: '8px',
    right: '0',
    bottom: '24px',
    width: '24px',
    paddingLeft: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2',
    boxSizing: 'border-box',
  },
  '.cm-table-add-row-zone': {
    position: 'absolute',
    bottom: '0',
    left: '0',
    width: 'calc(100% - 24px)',
    height: '24px',
    paddingTop: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '2',
    boxSizing: 'border-box',
  },
  '.cm-table-add-col, .cm-table-add-row': {
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 150ms',
    background: 'var(--md-bg-secondary)',
    border: '1px solid var(--md-border)',
    color: 'var(--md-text-muted)',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    lineHeight: '1',
  },
  '.cm-table-add-col-zone:hover .cm-table-add-col': {
    opacity: '1',
    pointerEvents: 'auto',
  },
  '.cm-table-add-row-zone:hover .cm-table-add-row': {
    opacity: '1',
    pointerEvents: 'auto',
  },
  '.cm-table-add-col:hover, .cm-table-add-row:hover': {
    background: 'var(--md-accent-bg-hover)',
    color: 'var(--md-accent)',
  },
  '.cm-table-add-col': {
    width: '100%',
    height: '80%',
    borderRadius: 'var(--md-border-radius, 6px)',
  },
  '.cm-table-add-row': {
    height: '100%',
    width: '80%',
    borderRadius: 'var(--md-border-radius, 6px)',
  },
  '.cm-table-widget td.cm-table-cell-selected, .cm-table-widget th.cm-table-cell-selected': {
    backgroundColor: 'var(--md-accent-bg) !important',
  },
});

export function tableExtension(): Extension {
  return [tableDecorationsField, tableCellSelectionField, tableSelectionKeymap, tableTheme, subviewUpdatePlugin];
}
