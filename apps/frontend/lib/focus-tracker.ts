/**
 * Tracks the last focused editable element in the app.
 * Used by dictation to insert text into whichever field had focus
 * when recording started (CodeMirror, contentEditable, textarea, input).
 */

export type EditableType = 'codemirror' | 'contenteditable' | 'textarea' | 'input';

export interface FocusTarget {
  element: HTMLElement;
  type: EditableType;
}

let lastFocusedEditable: FocusTarget | null = null;
let initialized = false;

function classifyElement(el: HTMLElement): FocusTarget | null {
  // CodeMirror: any element inside .cm-editor
  const cmEditor = el.closest('.cm-editor');
  if (cmEditor) {
    const cmContent = cmEditor.querySelector('.cm-content') as HTMLElement | null;
    return { element: cmContent || (cmEditor as HTMLElement), type: 'codemirror' };
  }

  // contentEditable
  const editable = el.closest('[contenteditable="true"]') as HTMLElement | null;
  if (editable) {
    return { element: editable, type: 'contenteditable' };
  }

  // textarea
  if (el.tagName === 'TEXTAREA') {
    return { element: el, type: 'textarea' };
  }

  // text-like input
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
  // Check that the element is still in the DOM
  if (lastFocusedEditable && !document.body.contains(lastFocusedEditable.element)) {
    lastFocusedEditable = null;
  }
  return lastFocusedEditable;
}

/**
 * Insert text into a non-CodeMirror editable element.
 * For CodeMirror, the existing dispatch path is used instead.
 */
export function insertTextIntoElement(target: FocusTarget, text: string): boolean {
  const { element, type } = target;

  // Guard against detached elements
  if (!document.body.contains(element)) return false;

  if (type === 'contenteditable') {
    element.focus();

    let sel = document.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // No selection — place cursor at end
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
      // Fallback: manual insertion via Range
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
      // Dispatch input event for React state sync
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
    // Dispatch input event for React state sync
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  return false;
}
