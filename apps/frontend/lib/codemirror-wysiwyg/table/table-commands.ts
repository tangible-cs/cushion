import { syntaxTree } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { parseTableNode, getCellAtPos, type TableData } from './table-parser';
import { tableCellSelectionField, setTableSelection, getSelectedRange } from './table-selection';

interface TableContext {
  table: TableData;
  tableNode: SyntaxNode;
  row: number;
  col: number;
}

function getTableContext(mainView: EditorView): TableContext | null {
  const tree = syntaxTree(mainView.state);
  const pos = mainView.state.selection.main.head;

  const tableNode = tree.topNode.getChildren('Table').find(
    (n: SyntaxNode) => n.from <= pos && n.to >= pos,
  );
  if (!tableNode) return null;

  const table = parseTableNode(tableNode, mainView.state.sliceDoc());
  if (!table) return null;

  const coords = getCellAtPos(table, pos);
  if (!coords) return null;

  return { table, tableNode, row: coords.row, col: coords.col };
}

function buildEmptyRow(mainView: EditorView, table: TableData): string {
  const refRow = table.rows[table.rows.length - 1];
  const refLine = mainView.state.doc.lineAt(refRow.from);
  return refLine.text.replace(/[^\s|]/g, ' ');
}

interface MoveOptions {
  cursorPos?: 'start' | 'end';
  autoAddRow?: boolean;
}

export function moveNextCell(mainView: EditorView, opts?: MoveOptions): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;

  let { row, col } = ctx;
  col++;
  if (col >= ctx.table.columns) {
    col = 0;
    row++;
  }
  if (row >= ctx.table.rows.length) {
    if (opts?.autoAddRow === false) return exitTableDown(mainView);
    addRowAfter(mainView);
    return true;
  }

  const target = ctx.table.rows[row]?.cells[col];
  if (target) {
    const anchor = opts?.cursorPos === 'end' ? target.to : target.from;
    mainView.dispatch({ selection: { anchor } });
  }
  return true;
}

export function movePrevCell(mainView: EditorView, opts?: MoveOptions): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;

  let { row, col } = ctx;
  col--;
  if (col < 0) {
    col = ctx.table.columns - 1;
    row--;
  }
  if (row < 0) {
    if (opts?.autoAddRow === false) return exitTableUp(mainView);
    return true;
  }

  const target = ctx.table.rows[row]?.cells[col];
  if (target) {
    const anchor = opts?.cursorPos === 'end' ? target.to : target.from;
    mainView.dispatch({ selection: { anchor } });
  }
  return true;
}

export function moveNextRow(mainView: EditorView, opts?: MoveOptions): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;

  const row = ctx.row + 1;
  if (row >= ctx.table.rows.length) {
    if (opts?.autoAddRow === false) return false;
    addRowAfter(mainView);
    return true;
  }

  const target = ctx.table.rows[row]?.cells[ctx.col];
  if (target) {
    const anchor = opts?.cursorPos === 'end' ? target.to : target.from;
    mainView.dispatch({ selection: { anchor } });
  }
  return true;
}

export function movePrevRow(mainView: EditorView, opts?: MoveOptions): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;

  const row = ctx.row - 1;
  if (row < 0) return false;

  const target = ctx.table.rows[row]?.cells[ctx.col];
  if (target) {
    const anchor = opts?.cursorPos === 'end' ? target.to : target.from;
    mainView.dispatch({ selection: { anchor } });
  }
  return true;
}

export function exitTableUp(mainView: EditorView): boolean {
  const tree = syntaxTree(mainView.state);
  const pos = mainView.state.selection.main.head;
  const tableNode = tree.topNode.getChildren('Table').find(
    (n: { from: number; to: number }) => n.from <= pos && n.to >= pos,
  );
  if (!tableNode) return false;

  const before = Math.max(tableNode.from - 1, 0);
  mainView.dispatch({ selection: { anchor: before } });
  mainView.focus();
  return true;
}

export function exitTableDown(mainView: EditorView): boolean {
  const tree = syntaxTree(mainView.state);
  const pos = mainView.state.selection.main.head;
  const tableNode = tree.topNode.getChildren('Table').find(
    (n: { from: number; to: number }) => n.from <= pos && n.to >= pos,
  );
  if (!tableNode) return false;

  const after = Math.min(tableNode.to + 1, mainView.state.doc.length);
  mainView.dispatch({ selection: { anchor: after } });
  mainView.focus();
  return true;
}

export function addRowAfter(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;

  const currentRow = ctx.table.rows[ctx.row] ?? ctx.table.rows[ctx.table.rows.length - 1];
  const newRowText = buildEmptyRow(mainView, ctx.table);
  const insertPos = currentRow.to;
  const targetOffset = findCellOffset(newRowText, ctx.col);

  mainView.dispatch({
    changes: { from: insertPos, insert: '\n' + newRowText },
    selection: { anchor: insertPos + 1 + targetOffset },
  });
  return true;
}

export function addRowBefore(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;
  if (ctx.row === 0) return true;

  const currentRow = ctx.table.rows[ctx.row];
  const newRowText = buildEmptyRow(mainView, ctx.table);
  const insertPos = currentRow.from;
  const targetOffset = findCellOffset(newRowText, ctx.col);

  mainView.dispatch({
    changes: { from: insertPos, insert: newRowText + '\n' },
    selection: { anchor: insertPos + targetOffset },
  });
  return true;
}

export function addColAfter(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;
  return insertColumn(mainView, ctx, ctx.col + 1);
}

export function addColBefore(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;
  return insertColumn(mainView, ctx, ctx.col);
}

export function deleteRow(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;
  if (ctx.row === 0) return true;
  if (ctx.table.rows.length <= 2) return true;

  const currentRow = ctx.table.rows[ctx.row];
  const prevLineEnd = mainView.state.doc.lineAt(currentRow.from).from - 1;
  const deleteFrom = Math.max(0, prevLineEnd);
  const nextRow = ctx.row + 1 < ctx.table.rows.length ? ctx.row : ctx.row - 1;

  mainView.dispatch({ changes: { from: deleteFrom, to: currentRow.to } });

  const newCtx = getTableContext(mainView);
  if (newCtx) {
    const safeRow = Math.min(nextRow, newCtx.table.rows.length - 1);
    const safeCol = Math.min(ctx.col, newCtx.table.columns - 1);
    const newTarget = newCtx.table.rows[safeRow]?.cells[safeCol];
    if (newTarget) {
      mainView.dispatch({ selection: { anchor: newTarget.from } });
    }
  }
  return true;
}

export function deleteCol(mainView: EditorView): boolean {
  const ctx = getTableContext(mainView);
  if (!ctx) return false;
  if (ctx.table.columns <= 1) return true;

  const changes: { from: number; to: number }[] = [];
  const doc = mainView.state.sliceDoc();

  let child = ctx.tableNode.firstChild;
  while (child) {
    const lineText = doc.slice(child.from, child.to);
    const colRange = getColumnRange(lineText, ctx.col);
    if (colRange) {
      changes.push({ from: child.from + colRange.from, to: child.from + colRange.to });
    }
    child = child.nextSibling;
  }

  changes.sort((a, b) => b.from - a.from);
  mainView.dispatch({ changes });

  const newCtx = getTableContext(mainView);
  if (newCtx) {
    const safeCol = Math.min(ctx.col, newCtx.table.columns - 1);
    const safeRow = Math.min(ctx.row, newCtx.table.rows.length - 1);
    const newTarget = newCtx.table.rows[safeRow]?.cells[safeCol];
    if (newTarget) {
      mainView.dispatch({ selection: { anchor: newTarget.from } });
    }
  }
  return true;
}

function findCellOffset(rowText: string, colIndex: number): number {
  let pipeCount = 0;
  let lastPipePos = -1;

  for (let i = 0; i < rowText.length; i++) {
    if (rowText[i] === '|') {
      if (pipeCount === colIndex + 1) {
        return Math.floor((lastPipePos + 1 + i) / 2);
      }
      pipeCount++;
      lastPipePos = i;
    }
  }

  if (lastPipePos >= 0) {
    return Math.floor((lastPipePos + 1 + rowText.length) / 2);
  }
  return Math.floor(rowText.length / 2);
}

function insertColumn(mainView: EditorView, ctx: TableContext, insertAt: number): boolean {
  const doc = mainView.state.sliceDoc();
  const changes: { from: number; insert: string }[] = [];

  let child = ctx.tableNode.firstChild;
  while (child) {
    const lineText = doc.slice(child.from, child.to);
    const isDelimiter = child.type.name === 'TableDelimiter';
    const insertPos = getPipePosition(lineText, insertAt);
    const cellText = isDelimiter ? '----|' : '    |';

    changes.push({ from: child.from + insertPos, insert: cellText });
    child = child.nextSibling;
  }

  mainView.dispatch({ changes });

  const newCtx = getTableContext(mainView);
  if (newCtx) {
    const safeRow = Math.min(ctx.row, newCtx.table.rows.length - 1);
    const target = newCtx.table.rows[safeRow]?.cells[insertAt];
    if (target) {
      mainView.dispatch({ selection: { anchor: target.from } });
    }
  }
  return true;
}

function getPipePosition(lineText: string, pipeIndex: number): number {
  let count = 0;
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '|') {
      if (count === pipeIndex + 1) return i;
      count++;
    }
  }
  return lineText.length;
}

function getColumnRange(lineText: string, colIndex: number): { from: number; to: number } | null {
  const pipes: number[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '|') pipes.push(i);
  }

  if (pipes.length < 2 || colIndex + 1 >= pipes.length) return null;

  return { from: pipes[colIndex], to: pipes[colIndex + 1] };
}

function getTableByFrom(mainView: EditorView, tableFrom: number): { table: TableData; tableNode: SyntaxNode } | null {
  const tree = syntaxTree(mainView.state);
  const tableNode = tree.topNode.getChildren('Table').find(
    (n: SyntaxNode) => n.from === tableFrom,
  );
  if (!tableNode) return null;

  const table = parseTableNode(tableNode, mainView.state.sliceDoc());
  if (!table) return null;

  return { table, tableNode };
}

export function addRowAtEnd(mainView: EditorView, tableFrom: number): boolean {
  const result = getTableByFrom(mainView, tableFrom);
  if (!result) return false;

  const { table } = result;
  const lastRow = table.rows[table.rows.length - 1];
  const newRowText = mainView.state.doc.lineAt(lastRow.from).text.replace(/[^\s|]/g, ' ');
  const insertPos = lastRow.to;

  mainView.dispatch({
    changes: { from: insertPos, insert: '\n' + newRowText },
    selection: { anchor: insertPos + 1 + findCellOffset(newRowText, 0) },
  });
  return true;
}

export function addColAtEnd(mainView: EditorView, tableFrom: number): boolean {
  const result = getTableByFrom(mainView, tableFrom);
  if (!result) return false;

  const { tableNode } = result;
  const doc = mainView.state.sliceDoc();
  const changes: { from: number; insert: string }[] = [];

  let child = tableNode.firstChild;
  while (child) {
    const lineText = doc.slice(child.from, child.to);
    const isDelimiter = child.type.name === 'TableDelimiter';
    const lastPipe = lineText.lastIndexOf('|');
    if (lastPipe !== -1) {
      const cellText = isDelimiter ? ' ----|' : '     |';
      changes.push({ from: child.from + lastPipe + 1, insert: cellText });
    }
    child = child.nextSibling;
  }

  mainView.dispatch({ changes });
  return true;
}

export function clearSelectedCells(mainView: EditorView): boolean {
  const sel = mainView.state.field(tableCellSelectionField);
  if (!sel) return false;

  const result = getTableByFrom(mainView, sel.tableFrom);
  if (!result) return false;

  const { table } = result;
  const { minRow, maxRow, minCol, maxCol } = getSelectedRange(sel);
  const changes: { from: number; to: number; insert: string }[] = [];

  for (let r = minRow; r <= maxRow; r++) {
    const row = table.rows[r];
    if (!row) continue;
    for (let c = minCol; c <= maxCol; c++) {
      const cell = row.cells[c];
      if (!cell || cell.from === cell.to) continue;
      changes.push({ from: cell.from, to: cell.to, insert: ' ' });
    }
  }

  if (changes.length === 0) return true;

  mainView.dispatch({
    changes,
    effects: setTableSelection.of(null),
  });
  return true;
}

