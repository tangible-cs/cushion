import { WidgetType, EditorView } from '@codemirror/view';
import { getResolvedBindings } from '@/stores/shortcutsStore';
import { matchShortcut } from '@/lib/shortcuts/utils';

/**
 * SVG-based checkbox widget for task list items.
 * Inspired by Tangent's checkbox implementation.
 */
type CheckboxState = 'open' | 'checked';

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly state: CheckboxState,
    readonly pos: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return this.state === other.state && this.pos === other.pos;
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement('span');
    wrapper.className = `cm-checkbox-widget cm-checkbox-${this.state}`;
    wrapper.setAttribute('aria-checked', this.state === 'checked' ? 'true' : 'false');
    wrapper.setAttribute('role', 'checkbox');
    wrapper.setAttribute('tabindex', '0');
    
    // Create SVG checkbox
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.style.display = 'block';
    svg.style.cursor = 'pointer';
    
    // Box outline
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '1');
    rect.setAttribute('y', '1');
    rect.setAttribute('width', '14');
    rect.setAttribute('height', '14');
    rect.setAttribute('rx', '2');
    const isChecked = this.state === 'checked';
    const accent = 'var(--md-accent)';

    rect.setAttribute('fill', isChecked ? accent : 'transparent');
    rect.setAttribute('stroke', isChecked ? accent : 'var(--md-text-muted)');
    rect.setAttribute('stroke-width', '1.5');
    svg.appendChild(rect);
    
    // Checkmark (only visible when checked)
    if (isChecked) {
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      check.setAttribute('d', 'M4 8l2.5 2.5L12 5');
      check.setAttribute('stroke', 'var(--color-base-00)');
      check.setAttribute('stroke-width', '2');
      check.setAttribute('stroke-linecap', 'round');
      check.setAttribute('stroke-linejoin', 'round');
      check.setAttribute('fill', 'none');
      svg.appendChild(check);
    }
    
    wrapper.appendChild(svg);
    
    // Click handler to toggle checkbox
    const handleToggle = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const newText = this.state === 'open' ? '[x]' : '[ ]';
      view.dispatch({
        changes: { from: this.pos, to: this.pos + 3, insert: newText },
      });
    };
    
    wrapper.addEventListener('mousedown', handleToggle);
    wrapper.addEventListener('keydown', (e: KeyboardEvent) => {
      const bindings = getResolvedBindings('editor.checkbox.toggle');
      if (!matchShortcut(e, bindings)) return;
      handleToggle(e);
    });

    // Styling
    wrapper.style.display = 'inline-flex';
    wrapper.style.alignItems = 'center';
    wrapper.style.marginRight = '8px';
    wrapper.style.verticalAlign = 'middle';
    wrapper.style.transition = 'transform 0.1s ease';
    
    return wrapper;
  }

  ignoreEvent() {
    return false;
  }
}
