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
    return hr;
  }

  ignoreEvent() {
    return false;
  }
}
