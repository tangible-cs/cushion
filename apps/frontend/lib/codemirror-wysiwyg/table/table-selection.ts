import { StateEffect, StateField } from '@codemirror/state';

export interface TableCellSelection {
  tableFrom: number;
  anchor: { row: number; col: number };
  head: { row: number; col: number };
}

export const setTableSelection = StateEffect.define<TableCellSelection | null>();

export const tableCellSelectionField = StateField.define<TableCellSelection | null>({
  create() { return null; },
  update(value, tr) {
    if (tr.docChanged) return null;
    for (const e of tr.effects) {
      if (e.is(setTableSelection)) return e.value;
    }
    return value;
  },
});

export function getSelectedRange(sel: TableCellSelection) {
  return {
    minRow: Math.min(sel.anchor.row, sel.head.row),
    maxRow: Math.max(sel.anchor.row, sel.head.row),
    minCol: Math.min(sel.anchor.col, sel.head.col),
    maxCol: Math.max(sel.anchor.col, sel.head.col),
  };
}
