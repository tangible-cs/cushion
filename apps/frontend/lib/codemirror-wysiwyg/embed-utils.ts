import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';

export const embedSourceRevealEffect = StateEffect.define<number | null>();

export type EmbedType = 'image' | 'pdf' | 'note' | 'unsupported';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif']);

export function classifyEmbed(filePath: string): EmbedType {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.md' || ext === '.markdown') return 'note';
  return 'unsupported';
}

export const dataUriCache = new Map<string, string>();

export function isRemoteSrc(src: string) {
  return /^https?:\/\/|^data:/.test(src);
}

export function getEditorView(el: HTMLElement): EditorView | null {
  const editorEl = el.closest('.cm-editor') as HTMLElement | null;
  return editorEl ? EditorView.findFromDOM(editorEl) : null;
}

export function createSourceToggle(wrapper: HTMLElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'cm-embed-source-toggle';
  btn.setAttribute('aria-label', 'Show source');
  btn.textContent = '</>';
  btn.onmousedown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const view = getEditorView(wrapper);
    if (!view) return;
    const pos = view.posAtDOM(wrapper);
    const line = view.state.doc.lineAt(pos);
    view.dispatch({
      effects: embedSourceRevealEffect.of(pos),
      selection: { anchor: line.from, head: line.to },
    });
  };
  return btn;
}
