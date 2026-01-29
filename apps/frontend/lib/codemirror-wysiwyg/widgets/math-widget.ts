import { WidgetType } from '@codemirror/view';
import katex from 'katex';

/**
 * Math widget for rendering LaTeX using KaTeX.
 * Supports both inline ($...$) and block ($$...$$) math.
 */
export class MathWidget extends WidgetType {
  private _dom: HTMLElement | null = null;

  constructor(
    readonly latex: string,
    readonly displayMode: boolean,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return other.latex === this.latex && other.displayMode === this.displayMode;
  }

  toDOM(): HTMLElement {
    if (this._dom) {
      // Re-use existing DOM if available
      return this._dom;
    }

    const wrapper = document.createElement('span');
    wrapper.className = this.displayMode ? 'cm-math-block-widget' : 'cm-math-inline-widget';
    wrapper.setAttribute('data-latex', this.latex);

    try {
      katex.render(this.latex, wrapper, {
        displayMode: this.displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
      });
    } catch (error) {
      // Show error placeholder if LaTeX parsing fails
      wrapper.textContent = this.latex;
      wrapper.className += ' cm-math-error';
      wrapper.title = String(error);
    }

    this._dom = wrapper;
    return wrapper;
  }

  override ignoreEvent(event: Event): boolean {
    // Allow click events for selection
    return event.type !== 'click';
  }

  override destroy(): void {
    this._dom = null;
  }
}
