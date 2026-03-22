
import { type Extension, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  unifiedMergeView,
  acceptChunk,
  rejectChunk,
  getChunks,
} from '@codemirror/merge';

// Theme for unified merge view diff decorations
export const diffTheme = EditorView.theme({
  '.cm-changedLine': {
    backgroundColor: 'var(--accent-green-12) !important',
    borderLeft: '3px solid var(--accent-green)',
  },
  '.cm-deletedChunk': {
    backgroundColor: 'var(--accent-red-12)',
    borderLeft: '3px solid var(--accent-red)',
  },
  '.cm-changedText': {
    backgroundColor: 'rgba(8, 185, 78, 0.22)',
  },
  '.cm-deletedText': {
    backgroundColor: 'rgba(233, 49, 71, 0.22)',
  },
  '.cm-merge-revert': {
    cursor: 'pointer',
  },
});

// Enter diff review mode
export function enterDiffReview(
  view: EditorView,
  compartment: Compartment,
  before: string,
  after: string,
) {
  const currentDoc = view.state.doc.toString();
  view.dispatch({
    changes: { from: 0, to: currentDoc.length, insert: after },
    effects: compartment.reconfigure(
      unifiedMergeView({
        original: before,
        highlightChanges: true,
        gutter: true,
        mergeControls: true,
        syntaxHighlightDeletions: true,
        allowInlineDiffs: true,
      })
    ),
  });
}

// Exit diff review mode
export function exitDiffReview(view: EditorView, compartment: Compartment) {
  view.dispatch({
    effects: compartment.reconfigure([]),
  });
}

// Accept all remaining chunks
export function acceptAllChunks(view: EditorView) {
  let chunksInfo = getChunks(view.state);
  while (chunksInfo && chunksInfo.chunks.length > 0) {
    const chunk = chunksInfo.chunks[0];
    acceptChunk(view, chunk.fromB);
    chunksInfo = getChunks(view.state);
  }
}

// Reject all remaining chunks
export function rejectAllChunks(view: EditorView) {
  let chunksInfo = getChunks(view.state);
  while (chunksInfo && chunksInfo.chunks.length > 0) {
    const chunk = chunksInfo.chunks[0];
    rejectChunk(view, chunk.fromB);
    chunksInfo = getChunks(view.state);
  }
}

// Accept chunk at cursor, or first remaining chunk
function acceptNextChunk(view: EditorView): boolean {
  if (acceptChunk(view)) return true;
  const info = getChunks(view.state);
  if (!info || info.chunks.length === 0) return false;
  return acceptChunk(view, info.chunks[0].fromB);
}

// Reject chunk at cursor, or first remaining chunk
function rejectNextChunk(view: EditorView): boolean {
  if (rejectChunk(view)) return true;
  const info = getChunks(view.state);
  if (!info || info.chunks.length === 0) return false;
  return rejectChunk(view, info.chunks[0].fromB);
}

// Get the number of remaining chunks
export function getChunkCount(state: EditorView['state']): number {
  const info = getChunks(state);
  return info ? info.chunks.length : 0;
}

// Keymap: Tab=accept, Shift-Tab=reject, Mod-Enter=accept all, Escape=reject all
export function diffReviewKeymap(
  onAcceptAll: () => void,
  onRejectAll: () => void,
): Extension {
  return keymap.of([
    {
      key: 'Tab',
      run: (view) => acceptNextChunk(view),
    },
    {
      key: 'Shift-Tab',
      run: (view) => rejectNextChunk(view),
    },
    {
      key: 'Mod-Enter',
      run: () => {
        onAcceptAll();
        return true;
      },
    },
    {
      key: 'Escape',
      run: () => {
        onRejectAll();
        return true;
      },
    },
  ]);
}
