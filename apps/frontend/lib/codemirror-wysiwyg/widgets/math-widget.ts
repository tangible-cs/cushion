import { WidgetType } from '@codemirror/view';
import katex from 'katex';
import { getEditorView } from '../embed-utils';

const heightCache = new Map<string, number>();

function cacheKey(latex: string, displayMode: boolean): string {
  return `${displayMode ? 'B' : 'I'}:${latex}`;
}

export class MathWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly displayMode: boolean,
    readonly sourceRevealed: boolean = false,
    readonly contentFrom: number = 0,
    readonly contentTo: number = 0,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return (
      this.latex === other.latex &&
      this.displayMode === other.displayMode &&
      this.sourceRevealed === other.sourceRevealed
    );
  }

  get estimatedHeight(): number {
    return heightCache.get(cacheKey(this.latex, this.displayMode))
      ?? (this.displayMode ? 60 : -1);
  }

  toDOM(): HTMLElement {
    const key = cacheKey(this.latex, this.displayMode);
    const cachedHeight = heightCache.get(key);
    const wrapper = document.createElement(this.displayMode ? 'div' : 'span');
    wrapper.className = this.displayMode ? 'cm-math-block-widget' : 'cm-math-inline-widget';
    if (cachedHeight) wrapper.style.minHeight = `${cachedHeight}px`;

    if (this.displayMode && !this.sourceRevealed) {
      const container = document.createElement('div');
      container.className = 'cm-math-container';

      const katexEl = document.createElement('div');
      katexEl.className = 'cm-math-rendered';
      this.renderKatex(katexEl);
      container.appendChild(katexEl);

      const selectContent = () => {
        const view = getEditorView(wrapper);
        if (!view) return;
        view.dispatch({ selection: { anchor: this.contentFrom, head: this.contentTo } });
        view.focus();
      };

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'cm-math-source-toggle';
      toggleBtn.setAttribute('aria-label', 'Edit math');
      toggleBtn.textContent = '</>';
      toggleBtn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectContent();
      };
      container.appendChild(toggleBtn);

      container.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).closest('.cm-math-source-toggle')) return;
        e.preventDefault();
        e.stopPropagation();
        selectContent();
      });

      wrapper.appendChild(container);
    } else {
      this.renderKatex(wrapper);
    }

    queueMicrotask(() => {
      if (wrapper.isConnected) {
        const h = wrapper.getBoundingClientRect().height;
        if (h > 0) {
          heightCache.set(key, h);
          wrapper.style.minHeight = '';
          getEditorView(wrapper)?.requestMeasure();
        }
      }
    });

    return wrapper;
  }

  updateDOM(dom: HTMLElement): boolean {
    if (this.displayMode && !this.sourceRevealed) {
      const katexEl = dom.querySelector('.cm-math-rendered');
      if (katexEl) {
        this.renderKatex(katexEl as HTMLElement);
        return true;
      }
      return false;
    }
    this.renderKatex(dom);
    return true;
  }

  ignoreEvent(e: Event): boolean {
    return this.displayMode && !this.sourceRevealed && e instanceof MouseEvent;
  }

  private renderKatex(el: HTMLElement): void {
    try {
      katex.render(this.latex, el, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
      });
      el.classList.remove('cm-math-error');
    } catch {
      el.textContent = this.latex;
      el.classList.add('cm-math-error');
    }
  }
}
