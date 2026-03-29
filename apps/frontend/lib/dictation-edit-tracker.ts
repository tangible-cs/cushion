import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

interface TrackingState {
  view: EditorView;
  originalText: string;
  from: number;
  to: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
}

interface EditTrackerOptions {
  onCorrections: (original: string, edited: string) => void;
  debounceMs?: number;
  timeoutMs?: number;
}

export interface DictationEditTracker {
  extension: Extension;
  startTracking: (view: EditorView, originalText: string, from: number, to: number) => void;
  clearTracking: () => void;
}

export function createDictationEditTracker(options: EditTrackerOptions): DictationEditTracker {
  const { onCorrections, debounceMs = 1500, timeoutMs = 60000 } = options;

  let tracking: TrackingState | null = null;

  function clearTracking() {
    if (!tracking) return;
    if (tracking.debounceTimer) clearTimeout(tracking.debounceTimer);
    if (tracking.timeoutTimer) clearTimeout(tracking.timeoutTimer);
    tracking = null;
  }

  function fireCorrections() {
    if (!tracking) return;
    const { view, originalText, from, to } = tracking;
    const currentText = view.state.doc.sliceString(from, to);
    clearTracking();
    if (currentText !== originalText) {
      onCorrections(originalText, currentText);
    }
  }

  function startTracking(view: EditorView, originalText: string, from: number, to: number) {
    clearTracking();
    tracking = {
      view,
      originalText,
      from,
      to,
      debounceTimer: null,
      timeoutTimer: setTimeout(fireCorrections, timeoutMs),
    };
  }

  const extension = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (!tracking) return;
        if (!update.docChanged) return;

        let overlaps = false;
        update.changes.iterChangedRanges((fromA, toA) => {
          if (tracking && fromA < tracking.to && toA > tracking.from) {
            overlaps = true;
          }
        });

        if (!overlaps) return;

        tracking.from = update.changes.mapPos(tracking.from, 1);
        tracking.to = update.changes.mapPos(tracking.to, 1);

        if (tracking.debounceTimer) clearTimeout(tracking.debounceTimer);
        tracking.debounceTimer = setTimeout(fireCorrections, debounceMs);
      }
    },
  );

  return { extension, startTracking, clearTracking };
}
