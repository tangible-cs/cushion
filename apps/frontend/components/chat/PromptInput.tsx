import { type FormEvent, useCallback, useMemo, useRef, useState } from 'react';
import { ArrowUp, Eye, EyeOff, Plus, Shield, Square, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useChatStore,
  type PromptInputPayload,
} from '@/stores/chatStore';
import { getModelVariantOptions } from '@/lib/chat-helpers';
import { getCursorPosition, parseFromDOM } from '@/lib/prompt-dom';

import { ModelSelector } from './ModelSelector';
import { AgentSelector } from './AgentSelector';
import {
  SuggestionList,
  type SuggestionItem,
} from './SuggestionList';
import { formatShortcutList, matchShortcut, useShortcutBindings } from '@/lib/shortcuts';

import {
  usePromptCompact,
  COMPACT_LABEL_LENGTHS,
  COMPACT_LEVEL_MAX,
  VARIANT_SIZE_CLASSES,
  getCompactLabel,
} from '@/hooks/usePromptCompact';
import { usePromptHistory } from '@/hooks/usePromptHistory';
import { useLocalCommands } from '@/hooks/useLocalCommands';
import { usePromptEditor } from '@/hooks/usePromptEditor';
import {
  usePromptAttachments,
  SUPPORTED_TYPES,
  DragOverlay,
  AttachmentPreview,
} from './PromptInputAttachments';
import { usePromptSuggestions } from './PromptInputSuggestions';

const CHAT_SHORTCUT_IDS = [
  'chat.shell.exit',
  'chat.suggestions.next',
  'chat.suggestions.prev',
  'chat.suggestions.confirm',
  'chat.suggestions.close',
  'chat.session.abort',
  'chat.newline',
  'chat.submit',
] as const;

type PromptInputProps = {
  disabled?: boolean;
  placeholder?: string;
  onSubmit?: (value: PromptInputPayload) => void;
  className?: string;
  editorClassName?: string;
  editorWrapperClassName?: string;
};

export function PromptInput({
  disabled,
  placeholder,
  onSubmit,
  className,
  editorClassName,
  editorWrapperClassName,
}: PromptInputProps) {
  const promptText = useChatStore((state) => state.promptText);
  const setPromptText = useChatStore((state) => state.setPromptText);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatShortcuts = useShortcutBindings(CHAT_SHORTCUT_IDS);
  const currentFileContext = useChatStore((state) => state.currentFileContext);
  const toggleIncludeCurrentFile = useChatStore((state) => state.toggleIncludeCurrentFile);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const directory = useChatStore((state) => state.directory);
  const abortSession = useChatStore((state) => state.abortSession);
  const agents = useChatStore((state) => state.agents);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const selectedVariant = useChatStore((state) => state.selectedVariant);
  const setSelectedVariant = useChatStore((state) => state.setSelectedVariant);
  const autoAccept = useChatStore((state) => state.autoAccept);
  const toggleAutoAccept = useChatStore((state) => state.toggleAutoAccept);
  const [composing, setComposing] = useState(false);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const status = activeSessionId ? sessionStatus[activeSessionId] : undefined;
  const working = status?.type === 'busy' || status?.type === 'retry';
  const abortingSessions = useChatStore((state) => state.abortingSessions);
  const isAborting = activeSessionId ? abortingSessions[activeSessionId] ?? false : false;

  const { attachments, dragging, handleFiles, removeAttachment, clearAttachments } =
    usePromptAttachments(activeSessionId, directory, disabled);

  const {
    trigger,
    activeIndex,
    setActiveIndex,
    suggestions,
    setTriggerState,
    updateTrigger,
  } = usePromptSuggestions();

  const { navigateUp, navigateDown, pushHistory } = usePromptHistory();

  const { runLocalCommand } = useLocalCommands({ clearAttachments, setTriggerState });

  const { editorRef, handleInput, addPart, refreshTriggerFromSelection, focusEditorAt } =
    usePromptEditor({ disabled, trigger, setTriggerState, updateTrigger });

  const shellMode = promptText.startsWith('!');

  const { compactLevel, footerRef, leftControlsRef, rightControlsRef } = usePromptCompact({
    shellMode,
    deps: [selectedAgent, agents.length, selectedModel?.providerID, selectedModel?.modelID],
  });

  const variantOptions = useMemo(() => getModelVariantOptions(providers, selectedModel), [providers, selectedModel]);
  const variantLabel = useMemo(() => {
    if (variantOptions.length === 0) return null;
    if (!selectedVariant) return 'Default';
    const current = variantOptions.find((option) => option.key === selectedVariant);
    return current?.label ?? 'Default';
  }, [variantOptions, selectedVariant]);
  const compactVariantLabel = useMemo(() => {
    if (!variantLabel || compactLevel === 0) return null;
    const maxLength = COMPACT_LABEL_LENGTHS[Math.min(compactLevel, COMPACT_LEVEL_MAX)];
    return getCompactLabel(variantLabel, maxLength);
  }, [variantLabel, compactLevel]);

  const cycleVariant = useCallback(() => {
    if (variantOptions.length === 0) return;
    const keys = variantOptions.map((option) => option.key);
    const currentIndex = selectedVariant ? keys.indexOf(selectedVariant) + 1 : 0;
    const nextIndex = (currentIndex + 1) % (keys.length + 1);
    const nextVariant = nextIndex === 0 ? null : keys[nextIndex - 1];
    setSelectedVariant(nextVariant);
  }, [variantOptions, selectedVariant, setSelectedVariant]);

  const isEmptyPrompt = promptText.replace(/\u200B/g, '').trim().length === 0;
  const showPlaceholder = Boolean(placeholder) && isEmptyPrompt && attachments.length === 0;
  const submitDisabled = Boolean(disabled)
    || isAborting
    || (!working && isEmptyPrompt && attachments.length === 0);

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = promptText.trim();
    const localMatch = trimmed.match(/^\/(\S+)$/);
    if (localMatch && runLocalCommand(localMatch[1])) return;
    const isEmpty = trimmed.length === 0 && attachments.length === 0;
    if (working && isEmpty) {
      abortSession().catch(() => undefined);
      return;
    }
    if (isEmpty) return;
    const parts = editorRef.current ? parseFromDOM(editorRef.current) : [];
    onSubmit?.({ text: promptText, parts, attachments, mode: shellMode ? 'shell' : 'prompt' });
    if (trimmed.length > 0) {
      pushHistory(shellMode ? 'shell' : 'normal', trimmed);
    }
    clearAttachments();
  };

  const applySuggestion = (item: SuggestionItem) => {
    if (item.type === 'command') {
      const value = item.value.endsWith(' ') ? item.value : `${item.value} `;
      addPart({ type: 'text', content: value });
      setTriggerState(null);
      return;
    }

    if (item.path) {
      addPart({ type: 'file', content: item.value, path: item.path });
      setTriggerState(null);
      return;
    }

    if (item.agent) {
      setSelectedAgent(item.agent);
      addPart({ type: 'agent', content: item.value, name: item.agent });
    }
    setTriggerState(null);
  };

  const handleCommandSelect = (item: SuggestionItem) => {
    if (runLocalCommand(item.id)) return;
    applySuggestion(item);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const isImeComposing = event.nativeEvent.isComposing || composing;
    const nativeEvent = event.nativeEvent;
    const editor = editorRef.current;
    if (!editor) return;

    if (event.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode;
        const offset = selection.anchorOffset;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? '';
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange();
            range.setStart(node, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }

    if (shellMode && matchShortcut(nativeEvent, chatShortcuts['chat.shell.exit'])) {
      event.preventDefault();
      const next = promptText.replace(/^!+/, '');
      setPromptText(next);
      setTriggerState(null);
      focusEditorAt(next.length);
      return;
    }

    if (shellMode && event.key === 'Backspace') {
      const caret = getCursorPosition(editor);
      if (promptText === '!' && caret <= 1) {
        event.preventDefault();
        setPromptText('');
        setTriggerState(null);
        focusEditorAt(0);
        return;
      }
    }

    if (suggestions.length > 0 && trigger) {
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.next'])) {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.prev'])) {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.confirm'])) {
        event.preventDefault();
        const item = suggestions[activeIndex];
        if (!item) return;
        if (item.type === 'command') {
          handleCommandSelect(item);
          return;
        }
        applySuggestion(item);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.close'])) {
        event.preventDefault();
        setTriggerState(null);
        return;
      }
    }

    if (working && matchShortcut(nativeEvent, chatShortcuts['chat.session.abort'])) {
      event.preventDefault();
      abortSession().catch(() => undefined);
      return;
    }

    if (matchShortcut(nativeEvent, chatShortcuts['chat.newline'])) {
      addPart({ type: 'text', content: '\n' });
      event.preventDefault();
      return;
    }

    if (matchShortcut(nativeEvent, chatShortcuts['chat.submit'])) {
      if (isImeComposing) return;
      event.preventDefault();
      handleSubmit();
      return;
    }

    if (event.key === 'ArrowUp') {
      const caret = getCursorPosition(editor);
      const key = shellMode ? 'shell' : 'normal';
      const nextValue = navigateUp(key, promptText, caret === 0);
      if (nextValue === null) return;
      event.preventDefault();
      setPromptText(nextValue);
      focusEditorAt(nextValue.length);
      return;
    }

    if (event.key === 'ArrowDown') {
      const key = shellMode ? 'shell' : 'normal';
      const nextValue = navigateDown(key);
      if (nextValue === null) return;
      event.preventDefault();
      setPromptText(nextValue);
      focusEditorAt(nextValue.length);
    }
  };

  const handleSuggestionSelect = (item: SuggestionItem) => {
    if (item.type === 'command') {
      handleCommandSelect(item);
    } else {
      applySuggestion(item);
    }
  };

  return (
    <div className={cn("relative flex flex-col gap-3 max-h-[320px]", className)}>
      {trigger && (
        <SuggestionList
          suggestions={suggestions}
          onSelect={handleSuggestionSelect}
        />
      )}
      <form
        data-slot="prompt-input-form"
        onSubmit={handleSubmit}
        className={cn(
          "group/prompt-input relative flex flex-col overflow-hidden rounded-[14px] border border-border bg-background shadow-sm",
          dragging && "border-dashed border-[var(--md-accent)]"
        )}
      >
        <DragOverlay dragging={dragging} />
        <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />
        <div className={cn("relative max-h-[240px] overflow-y-auto thin-scrollbar", editorWrapperClassName)}>
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable={!disabled}
            data-slot="prompt-input-editor"
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={refreshTriggerFromSelection}
            onMouseUp={refreshTriggerFromSelection}
            onPaste={(event) => {
              const items = event.clipboardData?.files;
              if (items && items.length > 0) {
                event.preventDefault();
                void handleFiles(Array.from(items));
              }
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onBlur={() => setComposing(false)}
            className={cn(
              "w-full min-h-[96px] whitespace-pre-wrap px-3 py-3 pr-12 text-sm text-foreground focus:outline-none",
              shellMode && "font-mono",
              editorClassName
            )}
          />
          {showPlaceholder && (
            <div className="pointer-events-none absolute top-0 inset-x-0 px-3 py-3 pr-12 text-sm text-muted-foreground truncate">
              {placeholder}
            </div>
          )}
        </div>
        <div ref={footerRef} className="relative flex items-center justify-between px-3 py-2">
          <div ref={leftControlsRef} className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
            {shellMode ? (
              <div className="flex items-center gap-2 px-2 h-6 text-xs">
                <Terminal className="size-4 text-foreground" />
                <span className="text-foreground">Shell mode</span>
                <span className="text-muted-foreground">
                  {(() => {
                    const label = formatShortcutList(chatShortcuts['chat.shell.exit']);
                    return label ? `${label} to exit` : 'Exit';
                  })()}
                </span>
              </div>
            ) : (
              <>
                {agents.length > 0 && (
                  <AgentSelector disabled={disabled} compactLevel={compactLevel} />
                )}
                <ModelSelector disabled={disabled} compactLevel={compactLevel} />
                {variantOptions.length > 0 && variantLabel && (
                  <button
                    type="button"
                    onClick={cycleVariant}
                    disabled={disabled}
                    title={variantLabel}
                    className={cn(
                      "h-7 min-w-0 rounded-md border border-transparent bg-transparent text-sm text-muted-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
                      VARIANT_SIZE_CLASSES[Math.min(compactLevel, COMPACT_LEVEL_MAX)]
                    )}
                    aria-label="Cycle thinking effort"
                  >
                    <span className="text-foreground truncate">
                      {compactVariantLabel ?? variantLabel}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
          <div ref={rightControlsRef} className="flex items-center gap-1.5 shrink-0">
            <input
              ref={inputRef}
              type="file"
              accept={SUPPORTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleFiles([file]);
                e.currentTarget.value = '';
              }}
            />
            {currentFileContext && (
              <button
                type="button"
                onClick={toggleIncludeCurrentFile}
                className={cn(
                  "size-7 flex items-center justify-center rounded-md transition-colors",
                  currentFileContext.enabled
                    ? "text-foreground hover:bg-[var(--overlay-10)]"
                    : "text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground"
                )}
                title={currentFileContext.enabled ? 'Current file included' : 'Current file excluded'}
                aria-label={currentFileContext.enabled ? 'Exclude current file' : 'Include current file'}
              >
                {currentFileContext.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={toggleAutoAccept}
              className={cn(
                "size-7 flex items-center justify-center rounded-md transition-colors",
                autoAccept
                  ? "text-[var(--accent-green)] hover:bg-[color-mix(in_srgb,var(--accent-green)_10%,transparent)]"
                  : "text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground"
              )}
              title={autoAccept ? 'Auto-accept permissions (on)' : 'Auto-accept permissions (off)'}
              aria-label={autoAccept ? 'Auto-accept permissions (on)' : 'Auto-accept permissions (off)'}
              aria-pressed={autoAccept}
            >
              <Shield className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
              aria-label="Attach files"
            >
              <Plus className="size-5" />
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="size-7 flex items-center justify-center rounded-[10px] text-[var(--background-primary-alt)] bg-[var(--md-accent)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--background-primary-alt)_25%,transparent)] hover:brightness-95 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label={working ? 'Stop' : 'Send'}
            >
              {working ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4.5" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
