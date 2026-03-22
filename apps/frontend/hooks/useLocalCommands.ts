import { useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useToast } from '@/components/chat/Toast';

function getErrorMessage(error: unknown, fallback: string) {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

type LocalCommandDeps = {
  clearAttachments: () => void;
  setTriggerState: (state: null) => void;
};

export function useLocalCommands({ clearAttachments, setTriggerState }: LocalCommandDeps) {
  const setPromptText = useChatStore((state) => state.setPromptText);
  const undoSession = useChatStore((state) => state.undoSession);
  const redoSession = useChatStore((state) => state.redoSession);
  const compactSession = useChatStore((state) => state.compactSession);
  const shareSession = useChatStore((state) => state.shareSession);
  const unshareSession = useChatStore((state) => state.unshareSession);
  const { showToast } = useToast();

  const commands: Record<string, {
    before?: () => void;
    action?: () => Promise<void>;
    errorMsg?: string;
  }> = {
    clear: {},
    reset: {
      before: clearAttachments,
    },
    undo: {
      action: () => undoSession(),
      errorMsg: 'Failed to undo.',
    },
    redo: {
      action: () => redoSession(),
      errorMsg: 'Failed to redo.',
    },
    compact: {
      action: () => compactSession(),
      errorMsg: 'Failed to compact session.',
    },
    summarize: {
      action: () => compactSession(),
      errorMsg: 'Failed to compact session.',
    },
    share: {
      action: async () => {
        const url = await shareSession();
        if (!url) {
          showToast({
            variant: 'error',
            description: 'Share link unavailable.',
          });
          return;
        }
        await navigator.clipboard.writeText(url);
        showToast({
          variant: 'success',
          description: 'Share link copied to clipboard.',
        });
      },
      errorMsg: 'Failed to share session.',
    },
    unshare: {
      action: async () => {
        await unshareSession();
        showToast({
          variant: 'success',
          description: 'Session unshared.',
        });
      },
      errorMsg: 'Failed to unshare session.',
    },
  };

  const runLocalCommand = useCallback((id: string) => {
    const cmd = commands[id];
    if (!cmd) return false;

    setPromptText('');
    cmd.before?.();
    setTriggerState(null);

    if (cmd.action) {
      const { action, errorMsg } = cmd;
      void (async () => {
        try {
          await action();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, errorMsg ?? 'Command failed.'),
          });
        }
      })();
    }

    return true;
  }, [
    clearAttachments,
    compactSession,
    redoSession,
    setPromptText,
    setTriggerState,
    shareSession,
    showToast,
    undoSession,
    unshareSession,
  ]);

  return { runLocalCommand };
}
