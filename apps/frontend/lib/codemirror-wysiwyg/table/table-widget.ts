import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState, Range } from '@codemirror/state';
import type { Rect, DecorationSet } from '@codemirror/view';
import { WidgetType, EditorView, Decoration } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { parseTableNode, getCellAtPos, type TableData, type RowData } from './table-parser';
import { createSubviewForCell, hiddenSpanField } from './table-subview';
import { tableCellSelectionField, setTableSelection, getSelectedRange, type TableCellSelection } from './table-selection';
import { addRowAtEnd, addColAtEnd } from './table-commands';

const heightCache = new Map<string, number>();

function isCellInRange(row: number, col: number, sel: TableCellSelection): boolean {
  const { minRow, maxRow, minCol, maxCol } = getSelectedRange(sel);
  return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
}

export class TableWidget extends WidgetType {
  constructor(
    readonly tableData: TableData,
    readonly node: SyntaxNode,
  ) {
    super();
  }

  private get cacheKey(): string {
    return String(this.node.from);
  }

  get estimatedHeight(): number {
    return heightCache.get(this.cacheKey) ?? this.tableData.rows.length * 100;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-table-widget';

    const table = document.createElement('table');
    wrapper.appendChild(table);

    const colZone = document.createElement('div');
    colZone.className = 'cm-table-add-col-zone';
    const addColBtn = document.createElement('button');
    addColBtn.className = 'cm-table-add-col';
    addColBtn.textContent = '+';
    addColBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addColAtEnd(view, this.node.from);
    });
    colZone.appendChild(addColBtn);
    wrapper.appendChild(colZone);

    const rowZone = document.createElement('div');
    rowZone.className = 'cm-table-add-row-zone';
    const addRowBtn = document.createElement('button');
    addRowBtn.className = 'cm-table-add-row';
    addRowBtn.textContent = '+';
    addRowBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addRowAtEnd(view, this.node.from);
    });
    rowZone.appendChild(addRowBtn);
    wrapper.appendChild(rowZone);

    this.updateTable(table, this.tableData, view);

    const cacheKey = this.cacheKey;
    view.requestMeasure({
      read() {
        const height = wrapper.getBoundingClientRect().height;
        heightCache.set(cacheKey, height);
      },
      key: cacheKey,
    });

    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const table = dom.querySelector('table');
    if (!table) return false;

    this.updateTable(table, this.tableData, view);

    const cacheKey = this.cacheKey;
    view.requestMeasure({
      read() {
        const height = dom.getBoundingClientRect().height;
        heightCache.set(cacheKey, height);
      },
      key: cacheKey,
    });
    return true;
  }

  destroy(dom: HTMLElement): void {
    for (const cell of dom.querySelectorAll<HTMLDivElement>('div.content')) {
      EditorView.findFromDOM(cell)?.destroy();
    }
  }

  coordsAt(dom: HTMLElement, pos: number, _side: number): Rect | null {
    const cells = [...dom.querySelectorAll<HTMLElement>('td, th')].map((cell) => ({
      td: cell,
      from: parseInt(cell.dataset.cellFrom!, 10),
      to: parseInt(cell.dataset.cellTo!, 10),
    }));

    const realPos = pos + this.node.from;

    for (const cell of cells) {
      if ((cell.from <= realPos && cell.to >= realPos) || realPos < cell.from) {
        const content = cell.td.querySelector('.content');
        if (content) {
          const { left, top, bottom } = content.getBoundingClientRect();
          return { left, right: left, top, bottom };
        }
        return cell.td.getBoundingClientRect();
      }
    }

    return dom.getBoundingClientRect();
  }

  ignoreEvent(_event: Event): boolean {
    return true;
  }

  private setSelectionToCell(td: HTMLTableCellElement, view: EditorView): void {
    const from = parseInt(td.dataset.cellFrom ?? '0', 10);
    view.dispatch({
      selection: { anchor: from },
      effects: setTableSelection.of(null),
    });
    view.focus();
  }

  private updateTable(table: HTMLTableElement, tableData: TableData, view: EditorView): void {
    const trs = [...table.querySelectorAll('tr')];
    const prevRowCount = trs.length;
    const prevColCount = trs[0]?.querySelectorAll('td, th').length ?? 0;
    const structureChanged = prevRowCount !== tableData.rows.length || prevColCount !== tableData.columns;

    while (trs.length > tableData.rows.length) {
      const removed = trs.pop()!;
      removed.parentElement?.removeChild(removed);
    }

    const coords = getCellAtPos(tableData, view.state.selection.main.head);

    const cellSel = view.state.field(tableCellSelectionField);
    const hasMultiSelect = cellSel !== null && cellSel.tableFrom === this.node.from &&
      !(cellSel.anchor.row === cellSel.head.row && cellSel.anchor.col === cellSel.head.col);

    for (let i = 0; i < tableData.rows.length; i++) {
      if (i === trs.length) {
        const tr = document.createElement('tr');
        table.appendChild(tr);
        trs.push(tr);
      }
      this.updateRow(trs[i], tableData.rows[i], i, tableData, view, coords, structureChanged, cellSel, hasMultiSelect);
    }
  }

  private updateRow(
    tr: HTMLTableRowElement,
    rowData: RowData,
    rowIdx: number,
    tableData: TableData,
    view: EditorView,
    selectionCoords?: { row: number; col: number },
    structureChanged?: boolean,
    cellSel?: TableCellSelection | null,
    hasMultiSelect?: boolean,
  ): void {
    const tagName = rowData.isHeader ? 'th' : 'td';
    const tds = [...tr.querySelectorAll<HTMLTableCellElement>(tagName)];

    while (tds.length > rowData.cells.length) {
      const removed = tds.pop()!;
      removed.parentElement?.removeChild(removed);
    }

    const { row: selRow, col: selCol } = selectionCoords ?? { row: -1, col: -1 };
    const tableFrom = this.node.from;

    for (let i = 0; i < rowData.cells.length; i++) {
      const cell = rowData.cells[i];
      const selectionInCell = !hasMultiSelect && selRow === rowIdx && selCol === i;

      if (i === tds.length) {
        const td = document.createElement(tagName);
        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('content');
        td.appendChild(contentWrapper);
        contentWrapper.textContent = cell.content || '\u00A0';

        td.addEventListener('mousedown', (event) => {
          if (contentWrapper.classList.contains('editing')) return;
          event.preventDefault();
          event.stopPropagation();

          const anchorRow = parseInt(td.dataset.row!, 10);
          const anchorCol = parseInt(td.dataset.col!, 10);

          this.setSelectionToCell(td, view);

          let dragged = false;

          const onMouseMove = (moveEvt: MouseEvent) => {
            const el = document.elementFromPoint(moveEvt.clientX, moveEvt.clientY);
            if (!el) return;
            const moveTd = (el as HTMLElement).closest('td, th') as HTMLTableCellElement | null;
            if (!moveTd || moveTd.dataset.row === undefined) return;

            const moveRow = parseInt(moveTd.dataset.row!, 10);
            const moveCol = parseInt(moveTd.dataset.col!, 10);

            if (moveRow !== anchorRow || moveCol !== anchorCol) {
              dragged = true;
              view.dispatch({
                effects: setTableSelection.of({
                  tableFrom,
                  anchor: { row: anchorRow, col: anchorCol },
                  head: { row: moveRow, col: moveCol },
                }),
              });
            }
          };

          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (dragged) {
              view.focus();
            }
          };

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });

        tr.appendChild(td);
        tds.push(td);
      }

      tds[i].dataset.row = String(rowIdx);
      tds[i].dataset.col = String(i);
      tds[i].dataset.cellFrom = String(cell.from);
      tds[i].dataset.cellTo = String(cell.to);
      tds[i].style.textAlign = tableData.alignments[i] || '';

      const inSelection = hasMultiSelect && cellSel && isCellInRange(rowIdx, i, cellSel);
      tds[i].classList.toggle('cm-table-cell-selected', !!inSelection);
      if (inSelection && cellSel) {
        const { minRow, maxRow, minCol, maxCol } = getSelectedRange(cellSel);
        const shadows: string[] = [];
        if (rowIdx === minRow) shadows.push('inset 0 2px 0 var(--md-accent)');
        if (rowIdx === maxRow) shadows.push('inset 0 -2px 0 var(--md-accent)');
        if (i === minCol) shadows.push('inset 2px 0 0 var(--md-accent)');
        if (i === maxCol) shadows.push('inset -2px 0 0 var(--md-accent)');
        tds[i].style.boxShadow = shadows.join(', ');
      } else {
        tds[i].style.boxShadow = '';
      }

      const contentWrapper: HTMLDivElement = tds[i].querySelector('div.content')!;
      const subview = EditorView.findFromDOM(contentWrapper);
      const [subviewFrom, subviewTo] = subview?.state.field(hiddenSpanField).cellRange ?? [-1, -1];

      if (subview !== null && !selectionInCell) {
        subview.destroy();
        contentWrapper.classList.remove('editing');
        contentWrapper.textContent = cell.content || '\u00A0';
      } else if (subview === null && selectionInCell) {
        const sel = view.state.selection.main;
        const newFrom = Math.min(Math.max(sel.from, cell.from), cell.to);
        const newTo = Math.min(Math.max(sel.to, cell.from), cell.to);

        requestAnimationFrame(() => {
          if (newFrom !== sel.from || newTo !== sel.to) {
            view.dispatch({ selection: { anchor: newFrom, head: newTo } });
          }
          contentWrapper.innerHTML = '';
          createSubviewForCell(view, contentWrapper, { from: cell.from, to: cell.to });
          contentWrapper.classList.add('editing');
        });
      } else if (subview === null) {
        const text = cell.content || '\u00A0';
        if (contentWrapper.textContent !== text) {
          contentWrapper.textContent = text;
        }
      } else if ((subviewFrom !== cell.from || subviewTo !== cell.to) && structureChanged) {
        subview.destroy();
        contentWrapper.innerHTML = '';
        createSubviewForCell(view, contentWrapper, { from: cell.from, to: cell.to });
      }
    }
  }

  public static createForState(state: EditorState): DecorationSet {
    const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state);
    const doc = state.sliceDoc();
    const decos: Range<Decoration>[] = [];

    for (const node of tree.topNode.getChildren('Table')) {
      const tableData = parseTableNode(node, doc);
      if (!tableData) continue;
      if (!tableData.rows.every(r => r.cells.length === tableData.columns)) continue;

      const from = node.from;
      const to = node.to;

      decos.push(
        Decoration.replace({
          widget: new TableWidget(tableData, node),
          block: true,
          side: 1,
        }).range(from, to),
      );
    }

    return Decoration.set(decos, true);
  }
}
