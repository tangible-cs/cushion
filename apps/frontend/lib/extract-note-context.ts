import type { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

const MAX_CHARS = 1000;

export function extractNoteContext(view: EditorView): string {
  const { state } = view;
  const cursor = state.selection.main.head;

  let headingText = '';
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      if (!/^ATXHeading[1-6]$/.test(node.type.name)) return;
      if (node.from > cursor) return false;
      headingText = state.doc.sliceString(node.from, node.to);
    },
  });

  const sliceFrom = Math.max(0, cursor - MAX_CHARS);
  const textBefore = state.doc.sliceString(sliceFrom, cursor);

  if (!headingText && !textBefore.trim()) return '';

  if (headingText) {
    return `${headingText}\n\n${textBefore}`;
  }

  return textBefore;
}
