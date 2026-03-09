import { WidgetType } from '@codemirror/view';
import { parseTableRow } from '../table/row-parser';

/**
 * Table widget that renders GFM markdown table syntax as an actual HTML <table>.
 * Used when cursor is outside the table block.
 */
export class TableWidget extends WidgetType {
  constructor(readonly rawText: string) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.rawText === this.rawText;
  }

  toDOM(): HTMLElement {
    const lines = this.rawText.split('\n').filter((l) => l.trim());
    if (lines.length < 2) {
      const span = document.createElement('span');
      span.textContent = this.rawText;
      return span;
    }

    const parseCells = (line: string): string[] => parseTableRow(line);

    // Parse alignment from delimiter row
    const delimiterCells = parseCells(lines[1]);
    const alignments = delimiterCells.map((cell) => {
      const left = cell.startsWith(':');
      const right = cell.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });

    const headerCells = parseCells(lines[0]);
    const bodyRows = lines.slice(2).map(parseCells);

    const table = document.createElement('table');
    table.className = 'cm-table-widget';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerCells.forEach((text, i) => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.textAlign = alignments[i] || 'left';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    if (bodyRows.length > 0) {
      const tbody = document.createElement('tbody');
      bodyRows.forEach((cells) => {
        const tr = document.createElement('tr');
        // Pad cells to match header count
        const colCount = Math.max(headerCells.length, cells.length);
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement('td');
          td.textContent = cells[i] || '';
          td.style.textAlign = alignments[i] || 'left';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    }

    return table;
  }

  override ignoreEvent(event: Event): boolean {
    return event.type !== 'click';
  }
}
