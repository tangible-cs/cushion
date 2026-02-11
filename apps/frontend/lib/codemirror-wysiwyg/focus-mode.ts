import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
} from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

/**
 * Focus mode for the editor.
 * When enabled, adds a focus-mode-active class on the editor.
 */

// Effect to set focus mode state
const setFocusModeEffect = StateEffect.define<boolean>();

// State field to track focus mode state
export const focusModeState = StateField.define<boolean>({
  create() {
    return false;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFocusModeEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * View plugin that adds/removes the focus-mode-active class on the editor.
 */
const focusModeClassPlugin = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      this.updateClass(view);
    }

    update(update: ViewUpdate) {
      if (update.state.field(focusModeState) !== update.startState.field(focusModeState)) {
        this.updateClass(update.view);
      }
    }

    updateClass(view: EditorView) {
      const isFocusMode = view.state.field(focusModeState);
      const editorEl = view.dom;
      
      if (isFocusMode) {
        editorEl.classList.add('focus-mode-active');
      } else {
        editorEl.classList.remove('focus-mode-active');
      }
    }
  }
);

/**
 * Focus mode extension.
 * Add this to your editor extensions to enable focus mode functionality.
 * Use setFocusMode to enable/disable.
 *
 * @example
 * ```ts
 * setFocusMode(view, true);
 * ```
 */
export function focusModeExtension() {
  return [
    focusModeState,
    focusModeClassPlugin,
  ];
}

/**
 * Helper function to set focus mode on an EditorView.
 */
export function setFocusMode(view: EditorView, enabled: boolean) {
  view.dispatch({
    effects: setFocusModeEffect.of(enabled),
  });
}

/**
 * Helper function to check if focus mode is currently enabled.
 */
export function isFocusModeEnabled(view: EditorView): boolean {
  return view.state.field(focusModeState);
}
