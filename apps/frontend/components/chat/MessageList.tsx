'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, File as FileIcon, Minus, Plus } from 'lucide-react';
import type {
  Message,
  Part,
  TextPart,
  FilePart,
  AgentPart,
  ToolPart,
  ReasoningPart,
  FileDiff,
  SnapshotPart,
  PatchPart,
  StepStartPart,
  StepFinishPart,
  RetryPart,
  AssistantMessage,
} from '@opencode-ai/sdk/v2/client';
import * as DiffLib from 'diff';
import { useChatStore } from '@/stores/chatStore';
import { useAutoScroll } from './useAutoScroll';
import { Markdown } from './Markdown';
import { Icon, getToolIconName } from './Icon';
import { Collapsible } from './Collapsible';

type MessageListProps = {
  className?: string;
};

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_PARTS: Part[] = [];
const TEXT_RENDER_THROTTLE_MS = 100;

// Utility to check if arrays are the same (for memo comparisons)
function same<T>(a: readonly T[], b: readonly T[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

// Type guards
function isText(part: Part): part is TextPart {
  return part.type === 'text';
}

function isReasoning(part: Part): part is ReasoningPart {
  return part.type === 'reasoning';
}

function isFile(part: Part): part is FilePart {
  return part.type === 'file';
}

function isAgent(part: Part): part is AgentPart {
  return part.type === 'agent';
}

function isAttachment(part: FilePart) {
  const mime = part.mime ?? '';
  return mime.startsWith('image/') || mime === 'application/pdf';
}

function isTool(part: Part): part is ToolPart {
  return part.type === 'tool';
}

function isSnapshot(part: Part): part is SnapshotPart {
  return part.type === 'snapshot';
}

function isPatch(part: Part): part is PatchPart {
  return part.type === 'patch';
}

function isStepStart(part: Part): part is StepStartPart {
  return part.type === 'step-start';
}

function isStepFinish(part: Part): part is StepFinishPart {
  return part.type === 'step-finish';
}

function isRetry(part: Part): part is RetryPart {
  return part.type === 'retry';
}

function getDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return normalized.slice(0, lastSlash + 1);
}

function getFilename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash <= 0) return normalized;
  return normalized.slice(lastSlash + 1);
}

function getUserText(parts: Part[]) {
  return parts.find((part) => isText(part) && !part.synthetic) as TextPart | undefined;
}

function getLastTextPart(parts: Part[]) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && isText(part)) return part;
  }
  return undefined;
}

function getFiles(parts: Part[]) {
  return parts.filter(isFile);
}

// Group messages into turns: each turn is a user message + its assistant responses
function groupMessagesIntoTurns(messages: Message[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let currentTurn: MessageTurn | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      // Save previous turn if exists
      if (currentTurn) {
        turns.push(currentTurn);
      }
      // Start new turn
      currentTurn = { userMessage: message, assistantMessages: [] };
    } else if (message.role === 'assistant' && currentTurn) {
      currentTurn.assistantMessages.push(message as AssistantMessage);
    }
  }

  // Don't forget the last turn
  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

type MessageTurn = {
  userMessage: Message;
  assistantMessages: AssistantMessage[];
};

function computeStatusFromPart(part: Part | undefined): string | undefined {
  if (!part) return undefined;

  if (part.type === 'tool') {
    switch (part.tool) {
      case 'task':
        return 'Delegating to agent...';
      case 'todowrite':
      case 'todoread':
        return 'Planning tasks...';
      case 'read':
        return 'Reading file...';
      case 'list':
      case 'grep':
      case 'glob':
        return 'Searching codebase...';
      case 'webfetch':
        return 'Searching web...';
      case 'edit':
      case 'write':
        return 'Making edits...';
      case 'bash':
        return 'Running commands...';
      default:
        return undefined;
    }
  }
  if (part.type === 'reasoning') {
    const text = part.text ?? '';
    const match = text.trimStart().match(/^\*\*(.+?)\*\*/);
    if (match) return `Thinking: ${match[1].trim()}`;
    return 'Thinking...';
  }
  if (part.type === 'text') {
    return 'Gathering thoughts...';
  }
  return undefined;
}

function formatDuration(startMs: number, endMs: number) {
  const delta = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function MessageList({ className }: MessageListProps) {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const messagesBySession = useChatStore((state) => state.messages);
  const messageMeta = useChatStore((state) => state.messageMeta);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const loadMoreMessages = useChatStore((state) => state.loadMoreMessages);

  const resolvedSessionId = useMemo(() => activeSessionId ?? null, [activeSessionId]);
  const messages = resolvedSessionId ? messagesBySession[resolvedSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  const meta = resolvedSessionId ? messageMeta[resolvedSessionId] : undefined;
  const status = resolvedSessionId ? sessionStatus[resolvedSessionId] : undefined;
  const isWorking = status?.type === 'busy' || status?.type === 'retry';

  // Group messages into turns for better performance
  const turns = useMemo(() => groupMessagesIntoTurns(messages), [messages]);
  const lastTurn = turns[turns.length - 1];
  const isLastTurnWorking = isWorking && lastTurn?.userMessage.role === 'user';

  const autoScroll = useAutoScroll({
    working: () => isWorking ?? false,
    onUserInteracted: () => {
      // User scrolled away from bottom
    },
    overflowAnchor: 'auto',
  });

  // Auto-scroll when turns change (for streaming)
  useEffect(() => {
    if (isWorking) {
      autoScroll.forceScrollToBottom();
    }
  }, [turns.length, isWorking, autoScroll.forceScrollToBottom]);

  if (!resolvedSessionId) {
    return (
      <div className={`flex-1 overflow-auto p-4 text-sm text-muted-foreground ${className ?? ''}`}>
        Start a new chat to create a session.
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={`flex-1 overflow-auto p-4 text-sm text-muted-foreground ${className ?? ''}`}>
        No messages yet.
      </div>
    );
  }

  return (
    <div className={`relative flex-1 min-h-0 ${className ?? ''}`.trim()}>
      <div data-slot="session-turn-resume" data-visible={autoScroll.userScrolled ? 'true' : undefined}>
        <button
          type="button"
          data-slot="session-turn-resume-button"
          onClick={() => autoScroll.forceScrollToBottom()}
          onMouseDown={(event) => event.preventDefault()}
          aria-label="Resume scroll"
        >
          <Icon name="arrow-down-to-line" size="small" />
        </button>
      </div>
      <div
        className="h-full overflow-auto"
        ref={autoScroll.scrollRef}
        onScroll={autoScroll.handleScroll}
        data-slot="session-turn-content"
      >
        {meta?.hasMore && (
          <div className="sticky top-0 z-30 flex justify-center bg-background/90 py-2">
            <button
              type="button"
              disabled={meta.loading}
              onClick={() => {
                if (!resolvedSessionId) return;
                loadMoreMessages(resolvedSessionId).catch(() => undefined);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {meta.loading ? 'Loading...' : 'Load earlier'}
            </button>
          </div>
        )}
        <div ref={autoScroll.contentRef} data-slot="session-turn-list">
          {turns.map((turn) => (
            <Turn
              key={turn.userMessage.id}
              turn={turn}
              sessionId={resolvedSessionId}
              isWorking={isLastTurnWorking && turn === lastTurn}
              onInteract={autoScroll.handleInteraction}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type TurnProps = {
  turn: MessageTurn;
  sessionId: string;
  isWorking: boolean;
  onInteract: () => void;
};

function Turn({ turn, sessionId, isWorking, onInteract }: TurnProps) {
  const [stepsExpanded, setStepsExpanded] = useState(false);
  const [duration, setDuration] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const parts = useChatStore((state) => state.parts[turn.userMessage.id] ?? EMPTY_PARTS);
  const sessionStatus = useChatStore((state) => state.sessionStatus[sessionId]);
  const sessionDiffs = useChatStore((state) => state.sessionDiffs[sessionId]);

  const textPart = getUserText(parts);
  const fileParts = getFiles(parts);
  const attachmentParts = fileParts.filter(isAttachment);
  const inlineFiles = fileParts.filter((part) => !isAttachment(part) && part.source?.text);
  const contextFiles = fileParts.filter((part) => !isAttachment(part) && !part.source?.text);
  const agentParts = parts.filter(isAgent);

  // Get all assistant parts for this turn
  const allAssistantParts = useMemo(() => {
    const allParts: Part[] = [];
    for (const msg of turn.assistantMessages) {
      const msgParts = useChatStore.getState().parts[msg.id] ?? [];
      allParts.push(...msgParts);
    }
    return allParts;
  }, [turn.assistantMessages]);

  const lastTextPart = useMemo(() => getLastTextPart(allAssistantParts), [allAssistantParts]);
  const responseText = lastTextPart?.text ?? '';
  const responsePartId = lastTextPart?.id;
  const hideResponsePart = !isWorking && !!responsePartId;

  // Compute status from last part
  const status = useMemo(() => {
    if (!isWorking) return undefined;
    const lastPart = allAssistantParts[allAssistantParts.length - 1];
    return computeStatusFromPart(lastPart);
  }, [isWorking, allAssistantParts]);

  const hasSteps = turn.assistantMessages.length > 0;
  const lastAssistant = turn.assistantMessages[turn.assistantMessages.length - 1];
  const lastAssistantId = lastAssistant?.id;
  const diffSummary =
    turn.userMessage.summary &&
    typeof turn.userMessage.summary === 'object' &&
    'diffs' in turn.userMessage.summary
      ? (turn.userMessage.summary.diffs ?? [])
      : [];

  // Auto-toggle steps while working
  useEffect(() => {
    setStepsExpanded(isWorking);
  }, [isWorking]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sticky = stickyRef.current;
    if (!sticky) {
      root.style.setProperty('--session-turn-sticky-height', '0px');
      return;
    }
    const update = () => {
      root.style.setProperty('--session-turn-sticky-height', `${Math.ceil(sticky.getBoundingClientRect().height)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(sticky);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const created = (turn.userMessage as { time?: { created?: number } }).time?.created;
    if (!created) {
      setDuration('');
      return;
    }
    const update = () => {
      const completed = (lastAssistant as { time?: { completed?: number } } | undefined)?.time?.completed;
      const fallback = (lastAssistant as { time?: { created?: number } } | undefined)?.time?.created ?? created;
      const end = completed ?? (isWorking ? Date.now() : fallback);
      setDuration(formatDuration(created, end));
    };
    update();
    if (!isWorking) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [turn.userMessage.id, isWorking, lastAssistantId]);

  return (
    <div data-component="session-turn" onClick={onInteract} ref={rootRef}>
      <div data-slot="session-turn-message-container">
        {attachmentParts.length > 0 && (
          <div data-slot="session-turn-attachments">
            <AttachmentList parts={attachmentParts} />
          </div>
        )}
        <div data-slot="session-turn-sticky" ref={stickyRef}>
          <div data-slot="session-turn-message-content">
            <div data-component="user-message">
              {textPart && (
                <div data-slot="user-message-text" className="text-sm">
                  <HighlightedText text={textPart.text ?? ''} fileRefs={inlineFiles} agentRefs={agentParts} />
                  {textPart.text && (
                    <div data-slot="user-message-copy-wrapper">
                      <CopyButton text={textPart.text} />
                    </div>
                  )}
                </div>
              )}
            </div>
            {contextFiles.length > 0 && <ContextList parts={contextFiles} />}
          </div>

          {(hasSteps || isWorking) && (
            <div data-slot="session-turn-response-trigger">
              <button
                type="button"
                onClick={() => setStepsExpanded((value) => !value)}
                data-slot="session-turn-collapsible-trigger-content"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full text-left"
              >
                {isWorking ? (
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className={`transition-transform ${stepsExpanded ? 'rotate-180' : ''}`}
                    data-slot="session-turn-trigger-icon"
                  >
                    <path
                      d="M8.125 1.875H1.875L5 8.125L8.125 1.875Z"
                      fill="currentColor"
                      stroke="currentColor"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                <span data-slot="session-turn-status-text">
                  {isWorking
                    ? status ?? 'Working...'
                    : stepsExpanded
                      ? 'Hide steps'
                      : 'Show steps'}
                </span>
                {duration && <span className="text-muted-foreground">· {duration}</span>}
                {sessionStatus?.type === 'retry' && (
                  <span className="text-muted-foreground">
                    · Retrying #{(sessionStatus as { attempt: number }).attempt}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {stepsExpanded && hasSteps && (
          <div data-slot="session-turn-collapsible">
            <div data-slot="session-turn-collapsible-content-inner">
              {turn.assistantMessages.map((msg) => (
                <AssistantStepsMessage
                  key={msg.id}
                  message={msg}
                  responsePartId={responsePartId}
                  hideResponsePart={hideResponsePart}
                  hideReasoning={!isWorking}
                />
              ))}
            </div>
          </div>
        )}

        {!isWorking && (responseText || diffSummary.length > 0) && (
          <div data-slot="session-turn-summary-section">
            <div data-slot="session-turn-summary-header">
              <h2 data-slot="session-turn-summary-title">Response</h2>
              <div data-slot="session-turn-response">
                {responseText && (
                  <div data-slot="session-turn-markdown" data-diffs={diffSummary.length > 0} className="text-sm">
                    <Markdown text={responseText} cacheKey={responsePartId} />
                  </div>
                )}
                {responseText && (
                  <div data-slot="session-turn-response-copy-wrapper">
                    <CopyButton text={responseText} />
                  </div>
                )}
              </div>
            </div>
            {diffSummary.length > 0 && <DiffSummary diffs={diffSummary} />}
          </div>
        )}
      </div>
    </div>
  );
}

type AssistantStepsMessageProps = {
  message: AssistantMessage;
  responsePartId?: string;
  hideResponsePart: boolean;
  hideReasoning: boolean;
};

const AssistantStepsMessage = memo(function AssistantStepsMessage({
  message,
  responsePartId,
  hideResponsePart,
  hideReasoning,
}: AssistantStepsMessageProps) {
  const parts = useChatStore((state) => state.parts[message.id] ?? EMPTY_PARTS);
  const lastTextPart = useMemo(() => getLastTextPart(parts), [parts]);
  const filteredParts = useMemo(() => {
    const withoutTodo = parts.filter((x) => x.type !== 'tool' || (x as ToolPart).tool !== 'todoread');
    const withoutReasoning = hideReasoning ? withoutTodo.filter((part) => part.type !== 'reasoning') : withoutTodo;
    if (!hideResponsePart || !responsePartId) return withoutReasoning;
    if (lastTextPart?.id !== responsePartId) return withoutReasoning;
    return withoutReasoning.filter((part) => part.id !== responsePartId);
  }, [parts, hideReasoning, hideResponsePart, responsePartId, lastTextPart?.id]);

  return (
    <div className="space-y-2">
      {filteredParts.map((part) => (
        <PartView key={part.id} part={part} />
      ))}
    </div>
  );
},
// Custom comparison to prevent unnecessary re-renders
(prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.responsePartId === nextProps.responsePartId &&
    prevProps.hideResponsePart === nextProps.hideResponsePart &&
    prevProps.hideReasoning === nextProps.hideReasoning
  );
});

const PartView = memo(function PartView({ part }: { part: Part }) {
  if (isText(part) && !part.synthetic) {
    return <TextPartView part={part} />;
  }
  if (isReasoning(part)) {
    return <ReasoningPartView part={part} />;
  }
  if (isTool(part)) {
    return <ToolPartView part={part} />;
  }
  if (isFile(part)) {
    return <AttachmentList parts={[part]} />;
  }
  if (isSnapshot(part)) {
    return (
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        Snapshot: {part.snapshot}
      </div>
    );
  }
  if (isPatch(part)) {
    return (
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        Patch {part.hash} · {part.files.length} files
      </div>
    );
  }
  if (isStepStart(part)) {
    return null;
  }
  if (isStepFinish(part)) {
    return null;
  }
  if (isRetry(part)) {
    return <div className="text-xs text-red-400">Retry {part.attempt}</div>;
  }
  return null;
});

const TextPartView = memo(function TextPartView({ part }: { part: TextPart }) {
  const text = useThrottledValue(part.text ?? '', TEXT_RENDER_THROTTLE_MS);
  if (!text) return null;
  return (
    <div className="text-sm">
      <Markdown text={text} cacheKey={part.id} />
    </div>
  );
});

const ReasoningPartView = memo(function ReasoningPartView({ part }: { part: ReasoningPart }) {
  const text = useThrottledValue(part.text ?? '', TEXT_RENDER_THROTTLE_MS);
  if (!text) return null;
  return (
    <div className="text-xs text-muted-foreground italic">
      <Markdown text={text} cacheKey={part.id} />
    </div>
  );
});

type CopyButtonProps = {
  text: string;
  className?: string;
};

function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    const clipboard = navigator?.clipboard;
    if (!clipboard) return;

    await clipboard.writeText(text);
    setCopied(true);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      data-component="copy-button"
      data-copied={copied ? 'true' : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        handleCopy().catch(() => undefined);
      }}
      className={className}
      aria-label={copied ? 'Copied' : 'Copy'}
      title={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

type HighlightSegment = {
  text: string;
  type?: 'file' | 'agent';
};

function buildHighlightSegments(text: string, fileRefs: FilePart[], agentRefs: AgentPart[]): HighlightSegment[] {
  const references: Array<{ start: number; end: number; type: 'file' | 'agent' }> = [];

  for (const ref of fileRefs) {
    const source = ref.source?.text;
    if (!source) continue;
    references.push({ start: source.start, end: source.end, type: 'file' });
  }

  for (const ref of agentRefs) {
    const source = ref.source;
    if (!source) continue;
    references.push({ start: source.start, end: source.end, type: 'agent' });
  }

  references.sort((a, b) => a.start - b.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const ref of references) {
    if (ref.start < cursor) continue;
    if (ref.start > text.length) break;
    if (ref.start > cursor) {
      segments.push({ text: text.slice(cursor, ref.start) });
    }
    const end = Math.min(ref.end, text.length);
    segments.push({ text: text.slice(ref.start, end), type: ref.type });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

function HighlightedText({ text, fileRefs, agentRefs }: { text: string; fileRefs: FilePart[]; agentRefs: AgentPart[] }) {
  const segments = buildHighlightSegments(text, fileRefs, agentRefs);
  return (
    <>
      {segments.map((segment, index) => {
        if (!segment.type) return <span key={index}>{segment.text}</span>;
        const className = segment.type === 'file'
          ? 'rounded bg-muted/30 px-0.5'
          : 'rounded bg-[var(--md-accent)]/20 px-0.5';
        return (
          <span key={index} className={className} data-highlight={segment.type}>
            {segment.text}
          </span>
        );
      })}
    </>
  );
}

function ContextList({ parts }: { parts: FilePart[] }) {
  const labels = parts.map((part) => part.filename ?? part.url ?? 'file');
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      Context: {labels.join(', ')}
    </div>
  );
}

// Throttled value hook to prevent excessive re-renders during streaming
function useThrottledValue(value: string, delay = TEXT_RENDER_THROTTLE_MS) {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);

  useEffect(() => {
    const now = Date.now();
    const remaining = delay - (now - lastUpdate.current);
    if (remaining <= 0) {
      lastUpdate.current = now;
      setThrottled(value);
      return;
    }
    const timeout = window.setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);

  return throttled;
}

type AttachmentListProps = {
  parts: FilePart[];
};

function AttachmentList({ parts }: AttachmentListProps) {
  const images = parts.filter((part) => part.mime.startsWith('image/') && part.url.startsWith('data:'));
  const files = parts.filter((part) => !part.mime.startsWith('image/'));
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((part) => (
            <img
              key={part.id}
              src={part.url}
              alt={part.filename ?? 'attachment'}
              className="h-16 w-16 rounded-md object-cover border border-border"
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Attachments: {files.map((part) => part.filename ?? part.url ?? 'file').join(', ')}
        </div>
      )}
    </div>
  );
}

type ToolPartViewProps = {
  part: ToolPart;
};

function ToolPartView({ part }: ToolPartViewProps) {
  const title = part.state?.status === 'completed' && 'title' in part.state ? part.state.title : part.tool;
  const status = part.state?.status ?? 'pending';
  const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
  const error = part.state?.status === 'error' && 'error' in part.state ? part.state.error : null;
  const attachments = part.state?.status === 'completed' && 'attachments' in part.state ? part.state.attachments : null;
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const icon = getToolIconName(part.tool);

  // Build subtitle from input
  let subtitle: string | undefined;
  const filePath = typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
  const description = typeof inputRecord?.description === 'string' ? inputRecord.description : undefined;
  const url = typeof inputRecord?.url === 'string' ? inputRecord.url : undefined;
  const path = typeof inputRecord?.path === 'string' ? inputRecord.path : undefined;
  if (part.tool === 'read' && filePath) {
    subtitle = filePath.split(/[/\\]/).pop() ?? filePath;
  }
  if ((part.tool === 'edit' || part.tool === 'write') && filePath) {
    subtitle = filePath.split(/[/\\]/).pop();
  }
  if (part.tool === 'bash' && description) {
    subtitle = description;
  }
  if (part.tool === 'webfetch' && url) {
    subtitle = url;
  }
  if (part.tool === 'list' && path) {
    subtitle = path.split(/[/\\]/).pop() ?? path;
  }
  if (part.tool === 'task' && description) {
    subtitle = description;
  }

  // For 'read' tool, don't show output - show loaded files instead
  const loadedValue = metadataRecord?.loaded;
  const loadedFiles = part.tool === 'read' && Array.isArray(loadedValue)
    ? loadedValue.filter((x): x is string => typeof x === 'string')
    : [];

  // Determine if there's content to show
  const hasOutput = !!output && part.tool !== 'read';
  const hasContent = hasOutput || !!error || (attachments && attachments.length > 0) || loadedFiles.length > 0;
  const defaultOpen = status === 'completed' && hasContent;

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Collapsible.Trigger
        className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-5 min-w-0 flex-1">
          <Icon name={icon} size="small" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground capitalize">
                {title}
              </span>
              {subtitle && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {hasContent && (
          <Collapsible.Arrow className="text-muted-foreground" />
        )}
      </Collapsible.Trigger>
      <Collapsible.Content className="pl-7 mt-1 space-y-1">
        {/* Show loaded files for 'read' tool */}
        {loadedFiles.length > 0 && (
          <div className="space-y-0.5">
            {loadedFiles.map((filepath, index) => (
              <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-green-500">→</span>
                <span>Loaded {filepath}</span>
              </div>
            ))}
          </div>
        )}
        {/* Show output for other tools (not 'read') */}
        {output && part.tool !== 'read' && (
          <div data-component="tool-output" data-scrollable className="text-xs text-muted-foreground py-1">
            <Markdown text={output} cacheKey={part.id} />
          </div>
        )}
        {attachments && attachments.length > 0 && <AttachmentList parts={attachments} />}
        {error && (
          <div className="text-xs text-red-400 py-1">{error}</div>
        )}
      </Collapsible.Content>
    </Collapsible>
  );
}

type DiffSummaryProps = {
  diffs: FileDiff[];
};

type DiffChangesProps = {
  changes: { additions: number; deletions: number } | { additions: number; deletions: number }[];
  variant?: 'default' | 'bars';
  className?: string;
};

function DiffChanges({ changes, variant = 'default', className }: DiffChangesProps) {
  const additions = Array.isArray(changes)
    ? changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0)
    : changes.additions ?? 0;
  const deletions = Array.isArray(changes)
    ? changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0)
    : changes.deletions ?? 0;
  const total = additions + deletions;

  if (variant === 'default' && total <= 0) return null;

  const TOTAL_BLOCKS = 5;
  const computeBlocks = () => {
    if (additions === 0 && deletions === 0) {
      return { added: 0, deleted: 0, neutral: TOTAL_BLOCKS };
    }
    const sum = additions + deletions;
    if (sum < 5) {
      const added = additions > 0 ? 1 : 0;
      const deleted = deletions > 0 ? 1 : 0;
      const neutral = TOTAL_BLOCKS - added - deleted;
      return { added, deleted, neutral };
    }
    const ratio = additions > deletions ? additions / Math.max(1, deletions) : deletions / Math.max(1, additions);
    const blocksForColors = sum < 20 || ratio < 4 ? TOTAL_BLOCKS - 1 : TOTAL_BLOCKS;
    const percentAdded = additions / sum;
    const percentDeleted = deletions / sum;
    const addedRaw = percentAdded * blocksForColors;
    const deletedRaw = percentDeleted * blocksForColors;
    let added = additions > 0 ? Math.max(1, Math.round(addedRaw)) : 0;
    let deleted = deletions > 0 ? Math.max(1, Math.round(deletedRaw)) : 0;
    if (additions > 0 && additions <= 5) added = Math.min(added, 1);
    if (additions > 5 && additions <= 10) added = Math.min(added, 2);
    if (deletions > 0 && deletions <= 5) deleted = Math.min(deleted, 1);
    if (deletions > 5 && deletions <= 10) deleted = Math.min(deleted, 2);
    let allocated = added + deleted;
    if (allocated > blocksForColors) {
      if (addedRaw > deletedRaw) {
        added = blocksForColors - deleted;
      } else {
        deleted = blocksForColors - added;
      }
      allocated = added + deleted;
    }
    const neutral = Math.max(0, TOTAL_BLOCKS - allocated);
    return { added, deleted, neutral };
  };

  const blocks = computeBlocks();
  const ADD_COLOR = 'var(--accent-green, #10b981)';
  const DELETE_COLOR = 'var(--accent-red, #ef4444)';
  const NEUTRAL_COLOR = 'var(--foreground-subtle, #9ca3af)';
  const visibleBlocks = [
    ...Array(blocks.added).fill(ADD_COLOR),
    ...Array(blocks.deleted).fill(DELETE_COLOR),
    ...Array(blocks.neutral).fill(NEUTRAL_COLOR),
  ].slice(0, TOTAL_BLOCKS);

  return (
    <div data-component="diff-changes" data-variant={variant} className={className}>
      {variant === 'bars' ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12" fill="none">
          <g>
            {visibleBlocks.map((color, index) => (
              <rect key={`${color}-${index}`} x={index * 4} width="2" height="12" rx="1" fill={color} />
            ))}
          </g>
        </svg>
      ) : (
        <>
          <span data-slot="diff-changes-additions">+{additions}</span>
          <span data-slot="diff-changes-deletions">-{deletions}</span>
        </>
      )}
    </div>
  );
}

type DiffLine = {
  type: 'addition' | 'deletion' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

type DiffHunk = {
  startIndex: number;
  endIndex: number;
  addedLines: number;
  removedLines: number;
};

function computeDiffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const diff = DiffLib.diffLines(before, after);
  const result: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of diff) {
    const lines = change.value.split('\n');
    const type = change.added
      ? 'addition'
      : change.removed
        ? 'deletion'
        : 'context';

    for (let i = 0; i < lines.length; i++) {
      const content = lines[i];
      if (i === lines.length - 1 && content === '') continue;

      if (type === 'addition') {
        result.push({
          type: 'addition',
          content,
          newLineNumber: newLineNum++,
        });
      } else if (type === 'deletion') {
        result.push({
          type: 'deletion',
          content,
          oldLineNumber: oldLineNum++,
        });
      } else {
        result.push({
          type: 'context',
          content,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  return result;
}

function computeDiffHunks(lines: DiffLine[], contextLines: number = 3): { hunks: DiffHunk[]; visibleLines: Set<number> } {
  const hunks: DiffHunk[] = [];
  const visibleLines = new Set<number>();
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChange = line.type === 'addition' || line.type === 'deletion';

    if (isChange) {
      if (!currentHunk) {
        currentHunk = {
          startIndex: Math.max(0, i - contextLines),
          endIndex: i,
          addedLines: 0,
          removedLines: 0,
        };
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          visibleLines.add(j);
        }
      }
      currentHunk.endIndex = i;
      if (line.type === 'addition') currentHunk.addedLines++;
      else currentHunk.removedLines++;
      visibleLines.add(i);
    } else if (currentHunk) {
      const contextAfter = contextLines;
      const endIndex = Math.min(lines.length - 1, i + contextAfter);
      if (endIndex > currentHunk.endIndex) {
        currentHunk.endIndex = endIndex;
        for (let j = i; j <= endIndex; j++) {
          visibleLines.add(j);
        }
        i = endIndex;
      }
      hunks.push(currentHunk);
      currentHunk = null;
    }
  }

  if (currentHunk) {
    for (let j = currentHunk.endIndex + 1; j < Math.min(lines.length, currentHunk.endIndex + 1 + contextLines); j++) {
      visibleLines.add(j);
      currentHunk.endIndex = j;
    }
    hunks.push(currentHunk);
  }

  return { hunks, visibleLines };
}

type DiffViewProps = {
  diff: FileDiff;
  shouldScrollToFirstChange?: boolean;
};

function DiffView({ diff, shouldScrollToFirstChange }: DiffViewProps) {
  const before = diff.before ?? '';
  const after = diff.after ?? '';
  const firstChangeRowRef = useRef<HTMLTableRowElement>(null);
  const hasScrolledRef = useRef(false);
  const [expandedSeparators, setExpandedSeparators] = useState<Set<number>>(new Set());
  const [expandedLineCount, setExpandedLineCount] = useState<Set<number>>(new Set());

  const CONTEXT_LINES = 3;
  const EXPANSION_LINES = 20;

  const { hunks, visibleLines } = useMemo(() => {
    if (!before && !after) return { hunks: [], visibleLines: new Set<number>() };
    const diffLines = computeDiffLines(before, after);
    return computeDiffHunks(diffLines, CONTEXT_LINES);
  }, [before, after]);

  const diffLines = useMemo(() => {
    if (!before && !after) return [];
    return computeDiffLines(before, after);
  }, [before, after]);

  const toggleSeparator = (separatorIndex: number) => {
    setExpandedSeparators((prev) => {
      const next = new Set(prev);
      if (next.has(separatorIndex)) {
        next.delete(separatorIndex);
      } else {
        next.add(separatorIndex);
      }
      return next;
    });
  };

  const getVisibleLinesWithExpansion = () => {
    const result = new Set<number>(visibleLines);
    for (const sepIndex of expandedSeparators) {
      const hunk = hunks[sepIndex];
      if (!hunk) continue;
      const nextHunk = hunks[sepIndex + 1];
      const end = nextHunk ? nextHunk.startIndex : diffLines.length;
      for (let i = hunk.endIndex + 1; i < Math.min(end, hunk.endIndex + 1 + EXPANSION_LINES); i++) {
        result.add(i);
      }
    }
    return result;
  };

  const currentVisibleLines = getVisibleLinesWithExpansion();

  const getSeparatorLines = (separatorIndex: number) => {
    const hunk = hunks[separatorIndex];
    const nextHunk = hunks[separatorIndex + 1];
    if (!hunk || !nextHunk) return null;
    const start = hunk.endIndex + 1;
    const end = nextHunk.startIndex - 1;
    return { start, end, count: end - start + 1 };
  };

  useEffect(() => {
    if (shouldScrollToFirstChange && !hasScrolledRef.current && firstChangeRowRef.current) {
      const row = firstChangeRowRef.current;

      requestAnimationFrame(() => {
        const linesBefore = 2;
        const lineGap = 24;

        row.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });

        setTimeout(() => {
          const rowOffsetTop = row.offsetTop;
          const scrollTop = Math.max(0, rowOffsetTop - (linesBefore * lineGap));
          const scrollableContainer = row.closest('[data-slot="session-turn-accordion-content"]') as HTMLElement;
          if (scrollableContainer) {
            scrollableContainer.scrollTo({
              top: scrollTop,
              behavior: 'auto'
            });
          }
          hasScrolledRef.current = true;
        }, 50);
      });
    }
  }, [shouldScrollToFirstChange]);

  const firstChangeIndex = diffLines.findIndex(l => l.type === 'addition' || l.type === 'deletion');

  if (diffLines.length === 0) {
    return (
      <div data-component="diff-view" data-empty>
        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--foreground-muted)' }}>
          No content to display
        </div>
      </div>
    );
  }

  return (
    <div data-component="diff-view">
      <table data-diffs>
        <tbody>
          {diffLines.map((line, index) => {
            if (!currentVisibleLines.has(index)) return null;

            const separatorIndex = hunks.findIndex((hunk, i) => i < hunks.length - 1 && hunk.endIndex === index - 1);
            const isSeparatorStart = separatorIndex !== -1;

            return (
              <React.Fragment key={index}>
                {isSeparatorStart && (
                  <tr data-separator>
                    <td data-column-number>
                      <button
                        type="button"
                        data-separator-expand
                        data-expanded={expandedSeparators.has(separatorIndex) ? 'true' : undefined}
                        onClick={() => toggleSeparator(separatorIndex)}
                        aria-label={expandedSeparators.has(separatorIndex) ? 'Show less' : 'Show more'}
                      >
                        <svg
                          width="10"
                          height="6"
                          viewBox="0 0 10 6"
                          fill="none"
                          style={{
                            transform: expandedSeparators.has(separatorIndex) ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease'
                          }}
                        >
                          <path
                            d="M5 6L0 1H1L5 5L9 1H10L5 6Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </td>
                    <td
                      colSpan={2}
                      data-separator-content
                      onClick={() => toggleSeparator(separatorIndex)}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      {getSeparatorLines(separatorIndex)?.count === 1
                        ? '1 unmodified line'
                        : `${getSeparatorLines(separatorIndex)?.count ?? 0} unmodified lines`}
                    </td>
                  </tr>
                )}
                <tr
                  key={index}
                  ref={index === firstChangeIndex ? firstChangeRowRef : null}
                  data-line
                  data-line-type={
                    line.type === 'addition'
                      ? 'change-addition'
                      : line.type === 'deletion'
                        ? 'change-deletion'
                        : !visibleLines.has(index) && currentVisibleLines.has(index)
                          ? 'context-expanded'
                          : 'context'
                  }
                >
                  <td data-column-number data-deletions={line.type === 'deletion' ? '' : undefined}>
                    {line.type === 'addition' ? '' : line.oldLineNumber ?? ''}
                  </td>
                  <td data-column-number>
                    {line.type === 'deletion' ? '' : line.newLineNumber ?? ''}
                  </td>
                  <td data-column-content>
                    {line.type === 'addition' && <Plus className="diff-icon inline" size={12} />}
                    {line.type === 'deletion' && <Minus className="diff-icon inline" size={12} />}
                    <span data-code>{line.content}</span>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DiffSummary({ diffs }: DiffSummaryProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [firstOpen, setFirstOpen] = useState<Set<string>>(new Set());
  const diffInit = 20;
  const diffBatch = 20;
  const [limit, setLimit] = useState(diffInit);

  useEffect(() => {
    setOpen(new Set());
    setFirstOpen(new Set());
    setLimit(diffInit);
  }, [diffs]);

  return (
    <div data-slot="session-turn-diff-summary">
      <div data-slot="session-turn-diff-title">Changes</div>
      <div data-slot="session-turn-accordion">
        {diffs.slice(0, limit).map((diff) => {
          const isOpen = open.has(diff.file);
          const hasContent = Boolean(diff.before || diff.after);
          const directory = getDirectory(diff.file);
          const filename = getFilename(diff.file);
          const isJustOpened = firstOpen.has(diff.file);

          const handleClick = () => {
            if (!hasContent) return;
            setOpen((prev) => {
              const newSet = new Set(prev);
              if (newSet.has(diff.file)) {
                newSet.delete(diff.file);
              } else {
                newSet.add(diff.file);
                setFirstOpen((prev) => new Set(prev).add(diff.file));
              }
              return newSet;
            });
          };

          return (
            <div
              key={diff.file}
              data-slot="session-turn-accordion-item"
              data-expanded={isOpen ? 'true' : undefined}
            >
              <div data-component="sticky-accordion-header" data-expanded={isOpen ? 'true' : undefined}>
                <button
                  type="button"
                  data-slot="session-turn-accordion-trigger"
                  onClick={handleClick}
                >
                  <div data-slot="session-turn-accordion-trigger-content">
                    <div data-slot="session-turn-file-info">
                      <FileIcon className="size-4 text-muted-foreground" />
                      <div data-slot="session-turn-file-path">
                        {directory && (
                          <span data-slot="session-turn-directory">{directory}</span>
                        )}
                        <span data-slot="session-turn-filename">{filename}</span>
                      </div>
                    </div>
                    <div data-slot="session-turn-accordion-actions">
                      <DiffChanges changes={diff} />
                      <Icon name="chevron-grabber-vertical" size="small" className="text-muted-foreground" />
                    </div>
                  </div>
                </button>
              </div>
              {isOpen && hasContent && (
                <div data-slot="session-turn-accordion-content">
                  <DiffView diff={diff} shouldScrollToFirstChange={isJustOpened} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {diffs.length > limit && (
        <button
          type="button"
          data-slot="session-turn-accordion-more"
          onClick={() => setLimit((value) => Math.min(value + diffBatch, diffs.length))}
        >
          Show more ({diffs.length - limit})
        </button>
      )}
    </div>
  );
}
