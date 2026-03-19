import type { SyntaxNode } from '@lezer/common';

export type Alignment = 'left' | 'center' | 'right' | 'none';

export interface CellData {
  from: number;
  to: number;
  paddingFrom: number;
  paddingTo: number;
  content: string;
  row: number;
  col: number;
}

export interface RowData {
  cells: CellData[];
  from: number;
  to: number;
  isHeader: boolean;
}

export interface TableData {
  rows: RowData[];
  columns: number;
  alignments: Alignment[];
  from: number;
  to: number;
}

export function parseTableNode(node: SyntaxNode, doc: string): TableData | null {
  if (node.type.name !== 'Table') return null;

  const rows: RowData[] = [];
  const alignments: Alignment[] = [];

  let child = node.firstChild;
  while (child) {
    if (child.type.name === 'TableHeader') {
      const row = parseRow(child, doc, 0, true);
      if (row) rows.push(row);
    } else if (child.type.name === 'TableDelimiter') {
      parseAlignments(child, doc, alignments);
    } else if (child.type.name === 'TableRow') {
      const row = parseRow(child, doc, rows.length, false);
      if (row) rows.push(row);
    }
    child = child.nextSibling;
  }

  if (rows.length === 0) return null;

  const columns = alignments.length > 0 ? alignments.length : rows[0]?.cells.length ?? 0;

  while (alignments.length < columns) {
    alignments.push('none');
  }

  return { rows, columns, alignments, from: node.from, to: node.to };
}

function parseRow(rowNode: SyntaxNode, doc: string, rowIndex: number, isHeader: boolean): RowData | null {
  const cells: CellData[] = [];
  const delimiters: { from: number; to: number }[] = [];
  const cellNodes: { from: number; to: number; content: string }[] = [];

  let child = rowNode.firstChild;
  while (child) {
    if (child.type.name === 'TableDelimiter') {
      delimiters.push({ from: child.from, to: child.to });
    } else if (child.type.name === 'TableCell') {
      cellNodes.push({ from: child.from, to: child.to, content: doc.slice(child.from, child.to) });
    }
    child = child.nextSibling;
  }

  for (let i = 0; i < delimiters.length - 1; i++) {
    const paddingFrom = delimiters[i].to;
    const paddingTo = delimiters[i + 1].from;
    const cellNode = cellNodes.find(c => c.from >= paddingFrom && c.to <= paddingTo);

    if (cellNode) {
      cells.push({
        from: cellNode.from, to: cellNode.to,
        paddingFrom, paddingTo,
        content: cellNode.content, row: rowIndex, col: i,
      });
    } else {
      const mid = Math.floor((paddingFrom + paddingTo) / 2);
      cells.push({
        from: mid, to: mid,
        paddingFrom, paddingTo,
        content: '', row: rowIndex, col: i,
      });
    }
  }

  if (delimiters.length > 0 && delimiters[0].from > rowNode.from) {
    const paddingFrom = rowNode.from;
    const paddingTo = delimiters[0].from;
    const cellNode = cellNodes.find(c => c.from >= paddingFrom && c.to <= paddingTo);
    if (cellNode) {
      cells.unshift({
        from: cellNode.from, to: cellNode.to,
        paddingFrom, paddingTo,
        content: cellNode.content, row: rowIndex, col: 0,
      });
      for (let i = 1; i < cells.length; i++) {
        cells[i].col = i;
      }
    }
  }

  if (cells.length === 0) return null;

  return { cells, from: rowNode.from, to: rowNode.to, isHeader };
}

function parseAlignments(delimNode: SyntaxNode, doc: string, alignments: Alignment[]): void {
  const text = doc.slice(delimNode.from, delimNode.to);
  const segments = text.split('|').filter(s => s.trim().length > 0);

  for (const seg of segments) {
    const trimmed = seg.trim();
    const left = trimmed.startsWith(':');
    const right = trimmed.endsWith(':');
    if (left && right) alignments.push('center');
    else if (right) alignments.push('right');
    else if (left) alignments.push('left');
    else alignments.push('none');
  }
}

export function getCellAtPos(table: TableData, pos: number): { row: number; col: number } | undefined {
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (pos >= cell.paddingFrom && pos <= cell.paddingTo) {
        return { row: cell.row, col: cell.col };
      }
    }
  }
  return undefined;
}
