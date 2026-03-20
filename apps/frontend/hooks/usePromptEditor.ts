import { useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/chatStore';
import {
  type PromptPart,
  type InsertPart,
  ZERO_WIDTH_SPACE,
  buildPromptParts,
  isPromptEqual,
  createTextFragment,
  createPill,
  getCursorPosition,
  setCursorPosition,
  setRangeEdge,
  parseFromDOM,
  isNormalizedEditor,
} from '@/lib/prompt-dom';
import type { TriggerState } from '@/components/chat/SuggestionList';

type PromptEditorDeps = {
  disabled?: boolean;
  trigger: TriggerState | null;
  setTriggerState: (state: TriggerState | null) => void;
  updateTrigger: (rawText: string, cursorPosition: number) => void;
};

export function usePromptEditor({ disabled, trigger, setTriggerState, updateTrigger }: PromptEditorDeps) {
  const promptText = useChatStore((state) => state.promptText);
  const setPromptText = useChatStore((state) => state.setPromptText);
  const contextItems = useChatStore((state) => state.contextItems);
  const removeContextItem = useChatStore((state) => state.removeContextItem);
  const agents = useChatStore((state) => state.agents);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const mirror = useRef({ input: false });

  const renderEditor = (parts: PromptPart[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = '';
    for (const part of parts) {
      if (part.type === 'text') {
        editor.appendChild(createTextFragment(part.content));
        continue;
      }
      if (part.type === 'file' || part.type === 'agent') {
        editor.appendChild(createPill(part));
      }
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const parts = buildPromptParts(promptText, contextItems, agents);
    const domParts = parseFromDOM(editor);

    if (mirror.current.input) {
      mirror.current.input = false;
      if (isNormalizedEditor(editor) && isPromptEqual(parts, domParts)) return;
    }

    const selection = window.getSelection();
    let cursorPosition: number | null = null;
    if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
      cursorPosition = getCursorPosition(editor);
    }

    renderEditor(parts);

    if (cursorPosition !== null) {
      setCursorPosition(editor, cursorPosition);
    }
  }, [promptText, contextItems, agents]);

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const rawParts = parseFromDOM(editor);
    const rawText = rawParts.map((p) => p.content).join('');
    const trimmed = rawText.replace(/\u200B/g, '').trim();
    const hasNonText = rawParts.some((part) => part.type !== 'text');
    const shouldReset = trimmed.length === 0 && !hasNonText;

    const syncContextItems = () => {
      if (contextItems.length === 0) return;
      const remainingPaths = new Set(
        rawParts.filter((p) => p.type === 'file').map((p) => (p as { path: string }).path)
      );
      for (const item of contextItems) {
        if (!remainingPaths.has(item.path)) removeContextItem(item.id);
      }
    };

    if (shouldReset) {
      setTriggerState(null);
      if (promptText !== '') {
        mirror.current.input = true;
        setPromptText('');
      }
      syncContextItems();
      return;
    }

    const cursorPosition = getCursorPosition(editor);
    updateTrigger(rawText, cursorPosition);

    if (rawText !== promptText) {
      mirror.current.input = true;
      setPromptText(rawText);
    }

    syncContextItems();
  };

  const refreshTriggerFromSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const parts = parseFromDOM(editor);
    const rawText = parts.map((p) => p.content).join('');
    const cursorPosition = getCursorPosition(editor);
    updateTrigger(rawText, cursorPosition);
  };

  const addPart = (part: InsertPart) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const cursorPosition = getCursorPosition(editor);
    const range = selection.getRangeAt(0);

    if (part.type === 'file' || part.type === 'agent') {
      const pill = createPill(part);
      const gap = document.createTextNode(' ');
      const textBeforeCursor = parseFromDOM(editor)
        .map((p) => p.content)
        .join('')
        .substring(0, cursorPosition);
      const atMatch = textBeforeCursor.match(/@(\S*)$/);

      if (trigger?.type === 'mention') {
        setRangeEdge(editor, range, 'start', trigger.start);
        setRangeEdge(editor, range, 'end', cursorPosition);
      } else if (atMatch) {
        const start = atMatch.index ?? cursorPosition - atMatch[0].length;
        setRangeEdge(editor, range, 'start', start);
        setRangeEdge(editor, range, 'end', cursorPosition);
      }

      range.deleteContents();
      range.insertNode(gap);
      range.insertNode(pill);
      range.setStartAfter(gap);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      handleInput();
      return;
    }

    const fragment = createTextFragment(part.content);
    const last = fragment.lastChild;

    if (trigger?.type === 'command') {
      setRangeEdge(editor, range, 'start', trigger.start);
      setRangeEdge(editor, range, 'end', cursorPosition);
    }

    range.deleteContents();
    range.insertNode(fragment);
    if (last) {
      if (last.nodeType === Node.TEXT_NODE) {
        const text = last.textContent ?? '';
        if (text === ZERO_WIDTH_SPACE) {
          range.setStart(last, 0);
        }
        if (text !== ZERO_WIDTH_SPACE) {
          range.setStart(last, text.length);
        }
      }
      if (last.nodeType !== Node.TEXT_NODE) {
        range.setStartAfter(last);
      }
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    handleInput();
  };

  const focusEditorAt = (position: number) => {
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      setCursorPosition(editor, position);
      refreshTriggerFromSelection();
    });
  };

  return { editorRef, handleInput, addPart, refreshTriggerFromSelection, focusEditorAt };
}
