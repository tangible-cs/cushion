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
  const clearContextItems = useChatStore((state) => state.clearContextItems);
  const undoSession = useChatStore((state) => state.undoSession);
  const redoSession = useChatStore((state) => state.redoSession);
  const compactSession = useChatStore((state) => state.compactSession);
  const shareSession = useChatStore((state) => state.shareSession);
  const unshareSession = useChatStore((state) => state.unshareSession);
  const { showToast } = useToast();

  const runLocalCommand = useCallback((id: string) => {
    if (id === 'clear') {
      setPromptText('');
      setTriggerState(null);
      return true;
    }
    if (id === 'reset') {
      setPromptText('');
      clearAttachments();
      clearContextItems();
      setTriggerState(null);
      return true;
    }
    if (id === 'undo') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await undoSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to undo.'),
          });
        }
      })();
      return true;
    }
    if (id === 'redo') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await redoSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to redo.'),
          });
        }
      })();
      return true;
    }
    if (id === 'compact' || id === 'summarize') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await compactSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to compact session.'),
          });
        }
      })();
      return true;
    }
    if (id === 'share') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
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
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to share session.'),
          });
        }
      })();
      return true;
    }
    if (id === 'unshare') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await unshareSession();
          showToast({
            variant: 'success',
            description: 'Session unshared.',
          });
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to unshare session.'),
          });
        }
      })();
      return true;
    }
    return false;
  }, [
    clearAttachments,
    clearContextItems,
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
