import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { headingFoldInfoField, headingFoldState, toggleHeadingFoldEffect } from './heading-fold';

const defaultButtonSize = 18;
const defaultGutterWidth = 24;

class HeadingFoldGutterView {
  private view: EditorView;
  private container: HTMLDivElement;
  private button: HTMLButtonElement;
  private hoveredLine: HTMLElement | null = null;
  private hoveredLineNumber: number | null = null;
  private pendingFrame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onMouseMove: (event: MouseEvent) => void;
  private readonly onMouseLeave: (event: MouseEvent) => void;
  private readonly onScroll: () => void;
  private readonly onButtonClick: (event: MouseEvent) => void;

  constructor(view: EditorView) {
    this.view = view;
    this.container = document.createElement('div');
    this.container.className = 'cm-heading-fold-gutter';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.display = 'none';
    this.container.style.width = 'var(--md-fold-chevron-size, 16px)';
    this.container.style.height = 'var(--md-fold-chevron-size, 16px)';
    this.container.style.pointerEvents = 'auto';

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'cm-heading-fold-button';
    this.button.setAttribute('aria-label', 'Toggle heading fold');
    this.button.setAttribute('aria-pressed', 'false');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('cm-heading-fold-icon');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 4l4 4-4 4');
    path.setAttribute('fill', 'currentColor');

    icon.appendChild(path);
    this.button.appendChild(icon);
    this.container.appendChild(this.button);
    this.view.dom.appendChild(this.container);

    this.onMouseMove = this.handleMouseMove.bind(this);
    this.onMouseLeave = this.handleMouseLeave.bind(this);
    this.onScroll = this.handleScroll.bind(this);
    this.onButtonClick = this.handleButtonClick.bind(this);

    this.view.dom.addEventListener('mousemove', this.onMouseMove);
    this.view.dom.addEventListener('mouseleave', this.onMouseLeave);
    this.view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.button.addEventListener('click', this.onButtonClick);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.schedulePositionUpdate();
      });
      this.resizeObserver.observe(this.view.dom);
      this.resizeObserver.observe(this.view.scrollDOM);
    }
  }

  update(update: ViewUpdate) {
    if (this.hoveredLineNumber === null) return;

    const lookup = update.state.field(headingFoldInfoField, false);
    const info = lookup?.get(this.hoveredLineNumber);
    if (!info || !info.hasFoldRange) {
      this.hide();
      return;
    }

    this.updateButtonState(update.state);

    if (update.docChanged || update.viewportChanged) {
      this.refreshHoveredLine();
      this.schedulePositionUpdate();
    }
  }

  destroy() {
    this.view.dom.removeEventListener('mousemove', this.onMouseMove);
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave);
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.button.removeEventListener('click', this.onButtonClick);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.pendingFrame !== null) {
      cancelAnimationFrame(this.pendingFrame);
      this.pendingFrame = null;
    }

    this.container.remove();
  }

  private handleMouseMove(event: MouseEvent) {
    if (this.container.contains(event.target as Node)) return;

    let lineEl = this.getLineElement(event.target);
    let lineNumber = lineEl ? this.getLineNumber(lineEl) : null;
    let fromGutter = false;

    if (!lineEl || !lineNumber) {
      const fallback = this.getLineFromCoords(event);
      if (fallback) {
        lineEl = fallback.lineEl;
        lineNumber = fallback.lineNumber;
        fromGutter = true;
      }
    }

    if (!lineEl || !lineNumber) {
      this.hide();
      return;
    }

    if (fromGutter && !this.isWithinHoverGutter(event, lineEl)) {
      this.hide();
      return;
    }

    const lookup = this.view.state.field(headingFoldInfoField, false);
    const info = lookup?.get(lineNumber);
    if (!info || !info.hasFoldRange) {
      this.hide();
      return;
    }

    this.hoveredLine = lineEl;
    this.hoveredLineNumber = lineNumber;
    this.show();
    this.updateButtonState();
    this.schedulePositionUpdate();
  }

  private handleMouseLeave(event: MouseEvent) {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && this.container.contains(nextTarget)) return;
    this.hide();
  }

  private handleScroll() {
    this.schedulePositionUpdate();
  }

  private show() {
    if (this.container.style.display !== 'flex') {
      this.container.style.display = 'flex';
    }
  }

  private hide() {
    this.container.style.display = 'none';
    this.hoveredLine = null;
    this.hoveredLineNumber = null;
  }

  private schedulePositionUpdate() {
    if (!this.hoveredLine) return;
    if (this.pendingFrame !== null) return;

    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = null;
      this.positionOverlay();
    });
  }

  private positionOverlay() {
    if (!this.hoveredLine) return;

    const lineRect = this.hoveredLine.getBoundingClientRect();
    const rootRect = this.view.dom.getBoundingClientRect();
    const lineStyle = getComputedStyle(this.hoveredLine);

    const lineHeight = Number.parseFloat(lineStyle.lineHeight);
    const resolvedLineHeight = Number.isFinite(lineHeight) ? lineHeight : lineRect.height;

    const gutterWidthValue = lineStyle.getPropertyValue('--md-fold-gutter-width').trim();
    const edgeOffsetValue = lineStyle.getPropertyValue('--md-fold-edge-offset').trim();
    const buttonSizeValue = lineStyle.getPropertyValue('--md-fold-chevron-size').trim();

    const gutterWidth = Number.parseFloat(gutterWidthValue);
    const edgeOffset = Number.parseFloat(edgeOffsetValue);
    const buttonSize = Number.parseFloat(buttonSizeValue);

    const resolvedGutterWidth = Number.isFinite(gutterWidth) ? gutterWidth : defaultGutterWidth;
    const resolvedEdgeOffset = Number.isFinite(edgeOffset) ? edgeOffset : 0;
    const resolvedButtonSize = Number.isFinite(buttonSize) ? buttonSize : defaultButtonSize;

    const paddingTop = Number.parseFloat(lineStyle.paddingTop) || 0;

    const top =
      lineRect.top - rootRect.top + paddingTop + (resolvedLineHeight - resolvedButtonSize) / 2;
    const left =
      lineRect.left - rootRect.left - (resolvedGutterWidth - resolvedEdgeOffset);

    this.container.style.top = `${top}px`;
    this.container.style.left = `${left}px`;
    this.container.style.width = `${resolvedButtonSize}px`;
    this.container.style.height = `${resolvedButtonSize}px`;
  }

  private updateButtonState(state = this.view.state) {
    if (this.hoveredLineNumber === null) return;
    const foldedLines = state.field(headingFoldState, false);
    const isFolded = Boolean(foldedLines?.has(this.hoveredLineNumber));
    this.button.classList.toggle('is-folded', isFolded);
    this.button.setAttribute('aria-pressed', String(isFolded));
    this.button.setAttribute('aria-label', isFolded ? 'Expand heading' : 'Collapse heading');
  }

  private handleButtonClick(event: MouseEvent) {
    if (this.hoveredLineNumber === null) return;
    const lookup = this.view.state.field(headingFoldInfoField, false);
    const info = lookup?.get(this.hoveredLineNumber);
    if (!info || !info.hasFoldRange) return;

    this.view.dispatch({
      effects: toggleHeadingFoldEffect.of({ lineNumber: this.hoveredLineNumber }),
    });

    this.view.focus();
    event.preventDefault();
    event.stopPropagation();
  }

  private isWithinHoverGutter(event: MouseEvent, lineEl: HTMLElement): boolean {
    const lineRect = lineEl.getBoundingClientRect();
    if (event.clientY < lineRect.top || event.clientY > lineRect.bottom) return false;

    const lineStyle = getComputedStyle(lineEl);
    const gutterWidthValue = lineStyle.getPropertyValue('--md-fold-gutter-width').trim();
    const edgeOffsetValue = lineStyle.getPropertyValue('--md-fold-edge-offset').trim();

    const gutterWidth = Number.parseFloat(gutterWidthValue);
    const edgeOffset = Number.parseFloat(edgeOffsetValue);

    const resolvedGutterWidth = Number.isFinite(gutterWidth) ? gutterWidth : defaultGutterWidth;
    const resolvedEdgeOffset = Number.isFinite(edgeOffset) ? edgeOffset : 0;

    const leftEdge = lineRect.left - (resolvedGutterWidth - resolvedEdgeOffset);
    const rightEdge = lineRect.left + 4;

    return event.clientX >= leftEdge && event.clientX <= rightEdge;
  }

  private getLineFromCoords(event: MouseEvent): { lineEl: HTMLElement; lineNumber: number } | null {
    const contentRect = this.view.contentDOM.getBoundingClientRect();
    const x = contentRect.left + 4;
    let pos: number | null;
    try {
      pos = this.view.posAtCoords({ x, y: event.clientY });
    } catch {
      return null;
    }
    if (pos === null || pos === undefined) return null;

    try {
      const lineNumber = this.view.state.doc.lineAt(pos).number;
      const lineEl = this.getLineElementFromNumber(lineNumber);
      if (!lineEl) return null;
      return { lineEl, lineNumber };
    } catch {
      return null;
    }
  }

  private getLineElement(target: EventTarget | null): HTMLElement | null {
    if (!target) return null;
    const node = target as Node;
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return null;
    return element.closest('.cm-line') as HTMLElement | null;
  }

  private getLineNumber(lineEl: HTMLElement): number | null {
    try {
      const pos = this.view.posAtDOM(lineEl, 0);
      if (pos === null || pos === undefined) return null;
      return this.view.state.doc.lineAt(pos).number;
    } catch {
      return null;
    }
  }

  private refreshHoveredLine() {
    if (this.hoveredLineNumber === null) return;
    const lineEl = this.getLineElementFromNumber(this.hoveredLineNumber);
    if (!lineEl) {
      this.hide();
      return;
    }
    this.hoveredLine = lineEl;
  }

  private getLineElementFromNumber(lineNumber: number): HTMLElement | null {
    try {
      const line = this.view.state.doc.line(lineNumber);
      const domAtPos = this.view.domAtPos(line.from);
      const element = domAtPos.node instanceof Element
        ? domAtPos.node
        : domAtPos.node.parentElement;
      return element?.closest('.cm-line') as HTMLElement | null;
    } catch {
      return null;
    }
  }
}

const headingFoldGutterPlugin = ViewPlugin.fromClass(HeadingFoldGutterView);

export function headingFoldGutterExtension(): Extension {
  return headingFoldGutterPlugin;
}
