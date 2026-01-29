import { WidgetType } from '@codemirror/view';

/**
 * Horizontal rule widget.
 * Renders a styled separator line.
 */
export class HrWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const hr = document.createElement('hr');
    hr.className = 'cm-hr-widget';
    hr.style.cssText = `
      border: none;
      border-top: 1px solid var(--md-hr-color, #4a4a4a);
      margin: 24px 0;
      height: 0;
    `;
    return hr;
  }

  ignoreEvent() {
    return false;
  }
}
