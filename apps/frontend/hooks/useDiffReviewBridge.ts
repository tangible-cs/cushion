
import { useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useDiffReviewStore } from '@/stores/diffReviewStore';

// Bridges AI session completion to the diff review system.
export function useDiffReviewBridge() {
  useEffect(() => {
    let wasIdle = true;

    const unsub = useChatStore.subscribe(
      (state) => {
        const sid = state.activeSessionId;
        if (!sid) return { status: null, autoAccept: state.autoAccept };
        return {
          status: state.sessionStatus[sid] ?? null,
          autoAccept: state.autoAccept,
        };
      },
      ({ status, autoAccept }) => {
        if (autoAccept) return; // No review when fully auto

        const isIdle = !status || (status.type !== 'busy' && status.type !== 'retry');
        if (!isIdle) { wasIdle = false; return; }
        if (wasIdle) return; // Not a transition
        wasIdle = true;

        // Session just went idle — trigger review
        const { fileSnapshots, reviewingFilePath } = useDiffReviewStore.getState();
        if (reviewingFilePath) return; // Already reviewing
        const entries = Object.entries(fileSnapshots);
        if (entries.length === 0) {
          return;
        }

        const currentFile = useWorkspaceStore.getState().currentFile;
        const target = entries.find(([fp]) => fp === currentFile) ?? entries[0];
        const [filePath, { before, after }] = target;

        if (before === after) {
          useDiffReviewStore.getState().clearSnapshotForFile(filePath);
          return;
        }

        useDiffReviewStore.getState().setPendingDiff({ filePath, before, after });
      },
    );
    return unsub;
  }, []);
}
