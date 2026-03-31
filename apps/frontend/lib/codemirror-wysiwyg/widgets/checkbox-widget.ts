import { WidgetType, EditorView } from '@codemirror/view';

export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly canceled: boolean,
    readonly markerFrom: number,
    readonly markerTo: number,
  ) {
    super();
  }

  eq(other: CheckboxWidget) {
    return this.checked === other.checked && this.canceled === other.canceled;
  }

  toDOM(view: EditorView) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-checkbox-widget';
    input.checked = this.checked;
    if (this.canceled) {
      input.indeterminate = true;
    }
    input.addEventListener('click', () => {
      const newMarker = this.checked ? '[ ]' : '[x]';
      view.dispatch({
        changes: { from: this.markerFrom, to: this.markerTo, insert: newMarker },
      });
      view.contentDOM.focus();
    });
    return input;
  }

  ignoreEvent(event: Event) {
    return event instanceof MouseEvent && event.type === 'mousedown';
  }
}
