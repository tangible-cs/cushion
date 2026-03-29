export type EditableType = 'codemirror' | 'contenteditable' | 'textarea' | 'input';

export interface FocusTarget {
  element: HTMLElement;
  type: EditableType;
}

let lastFocusedEditable: FocusTarget | null = null;
let initialized = false;

function classifyElement(el: HTMLElement): FocusTarget | null {
  const cmEditor = el.closest('.cm-editor');
  if (cmEditor) {
    const cmContent = cmEditor.querySelector('.cm-content') as HTMLElement | null;
    return { element: cmContent || (cmEditor as HTMLElement), type: 'codemirror' };
  }

  const editable = el.closest('[contenteditable="true"]') as HTMLElement | null;
  if (editable) {
    return { element: editable, type: 'contenteditable' };
  }

  if (el.tagName === 'TEXTAREA') {
    return { element: el, type: 'textarea' };
  }

  if (el.tagName === 'INPUT') {
    const inputType = (el as HTMLInputElement).type || 'text';
    if (['text', 'search', 'url', 'email', 'number'].includes(inputType)) {
      return { element: el, type: 'input' };
    }
  }

  return null;
}

function handleFocusIn(e: FocusEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const classified = classifyElement(target);
  if (classified) {
    lastFocusedEditable = classified;
  }
}

export function init() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('focusin', handleFocusIn, true);
}

export function destroy() {
  initialized = false;
  document.removeEventListener('focusin', handleFocusIn, true);
  lastFocusedEditable = null;
}

export function getLastFocusedEditable(): FocusTarget | null {
  if (lastFocusedEditable && !document.body.contains(lastFocusedEditable.element)) {
    lastFocusedEditable = null;
  }
  return lastFocusedEditable;
}

export function insertTextIntoElement(target: FocusTarget, text: string): boolean {
  const { element, type } = target;

  if (!document.body.contains(element)) return false;

  if (type === 'contenteditable') {
    element.focus();

    let sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }

    // execCommand('insertText') works with undo and fires input events
    const success = document.execCommand('insertText', false, text);
    if (!success) {
      const currentSel = document.getSelection();
      if (!currentSel || currentSel.rangeCount === 0) return true;
      const range = currentSel.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      currentSel.removeAllRanges();
      currentSel.addRange(range);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return true;
  }

  if (type === 'textarea' || type === 'input') {
    const inputEl = element as HTMLInputElement | HTMLTextAreaElement;
    inputEl.focus();
    const start = inputEl.selectionStart ?? inputEl.value.length;
    const end = inputEl.selectionEnd ?? inputEl.value.length;
    inputEl.setRangeText(text, start, end, 'end');
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}
