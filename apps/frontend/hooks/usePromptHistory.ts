import { useState, useCallback } from 'react';

type HistoryKey = 'normal' | 'shell';

export function usePromptHistory() {
  const [history, setHistory] = useState({ normal: [] as string[], shell: [] as string[] });
  const [historyIndex, setHistoryIndex] = useState({ normal: -1, shell: -1 });
  const [draft, setDraft] = useState({ normal: '', shell: '' });

  const navigateUp = useCallback((
    key: HistoryKey,
    currentText: string,
    caretAtStart: boolean,
  ): string | null => {
    if (!caretAtStart) return null;
    const list = history[key];
    if (list.length === 0) return null;
    const currentIndex = historyIndex[key];
    const nextIndex = currentIndex < 0 ? list.length - 1 : Math.max(currentIndex - 1, 0);
    if (currentIndex < 0) {
      setDraft((prev) => ({ ...prev, [key]: currentText }));
    }
    setHistoryIndex((prev) => ({ ...prev, [key]: nextIndex }));
    return list[nextIndex] ?? '';
  }, [history, historyIndex]);

  const navigateDown = useCallback((key: HistoryKey): string | null => {
    const list = history[key];
    const currentIndex = historyIndex[key];
    if (currentIndex < 0) return null;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= list.length) {
      setHistoryIndex((prev) => ({ ...prev, [key]: -1 }));
      return draft[key];
    }
    setHistoryIndex((prev) => ({ ...prev, [key]: nextIndex }));
    return list[nextIndex] ?? '';
  }, [history, historyIndex, draft]);

  const pushHistory = useCallback((key: HistoryKey, text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setHistory((prev) => {
      const list = prev[key];
      const last = list[list.length - 1];
      if (last === trimmed) return prev;
      return { ...prev, [key]: [...list, trimmed] };
    });
    setHistoryIndex((prev) => ({ ...prev, [key]: -1 }));
    setDraft((prev) => ({ ...prev, [key]: '' }));
  }, []);

  return { navigateUp, navigateDown, pushHistory };
}
