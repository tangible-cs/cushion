
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type PendingDiff = {
  filePath: string;
  before: string;
  after: string;
};

type DiffReviewState = {
  pendingDiff: PendingDiff | null;
  reviewingFilePath: string | null;
  reviewBefore: string | null;
  reviewAfter: string | null;
  chunkCount: number;
  fileSnapshots: Record<string, { before: string; after: string; sessionID: string }>;
};

type DiffReviewActions = {
  setPendingDiff: (diff: PendingDiff) => void;
  startReview: (filePath: string) => void;
  updateChunkCount: (count: number) => void;
  finishReview: () => void;
  captureSnapshot: (filePath: string, before: string, after: string, sessionID: string) => void;
  clearSnapshots: (sessionID?: string) => void;
  clearSnapshotForFile: (filePath: string) => void;
};

export const useDiffReviewStore = create<DiffReviewState & DiffReviewActions>()(
  subscribeWithSelector((set, get) => ({
    pendingDiff: null,
    reviewingFilePath: null,
    reviewBefore: null,
    reviewAfter: null,
    chunkCount: 0,
    fileSnapshots: {},

    setPendingDiff: (diff) =>
      set({ pendingDiff: diff }),

    startReview: (filePath) =>
      set((state) => ({
        reviewingFilePath: filePath,
        reviewBefore: state.pendingDiff?.before ?? null,
        reviewAfter: state.pendingDiff?.after ?? null,
        pendingDiff: null,
      })),

    updateChunkCount: (count) =>
      set({ chunkCount: count }),

    finishReview: () => {
      const { reviewingFilePath } = get();
      const updates: Partial<DiffReviewState> = {
        pendingDiff: null,
        reviewingFilePath: null,
        reviewBefore: null,
        reviewAfter: null,
        chunkCount: 0,
      };
      if (reviewingFilePath) {
        const { [reviewingFilePath]: _, ...rest } = get().fileSnapshots;
        updates.fileSnapshots = rest;
      }
      set(updates);
    },

    captureSnapshot: (filePath, before, after, sessionID) => {
      const existing = get().fileSnapshots[filePath];
      if (existing) {
        // Keep original `before`, update `after` to latest
        set((state) => ({
          fileSnapshots: {
            ...state.fileSnapshots,
            [filePath]: { ...existing, after },
          },
        }));
        return;
      }
      set((state) => ({
        fileSnapshots: {
          ...state.fileSnapshots,
          [filePath]: { before, after, sessionID },
        },
      }));
    },

    clearSnapshots: (sessionID?) => {
      if (!sessionID) {
        set({ fileSnapshots: {} });
        return;
      }
      set((state) => {
        const filtered: Record<string, { before: string; after: string; sessionID: string }> = {};
        for (const [fp, snap] of Object.entries(state.fileSnapshots)) {
          if (snap.sessionID !== sessionID) filtered[fp] = snap;
        }
        return { fileSnapshots: filtered };
      });
    },

    clearSnapshotForFile: (filePath) => {
      set((state) => {
        const { [filePath]: _, ...rest } = state.fileSnapshots;
        return { fileSnapshots: rest };
      });
    },
  }))
);
