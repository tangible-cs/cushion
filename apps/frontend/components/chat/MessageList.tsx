'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type {
  Message,
  Part,
  TextPart,
  FilePart,
  AgentPart,
  ToolPart,
  ReasoningPart,
  SnapshotPart,
  PatchPart,
  StepStartPart,
  StepFinishPart,
  RetryPart,
  AssistantMessage,
} from '@opencode-ai/sdk/v2/client';
import { useChatStore } from '@/stores/chatStore';
import { useAutoScroll } from './useAutoScroll';
import { Markdown } from './Markdown';
import { Icon } from './Icon';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { DiffSummary } from './DiffView';
import { ToolPartView, AttachmentList } from './ToolPartView';

type MessageListProps = {
  className?: string;
};

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_PARTS: Part[] = [];
const TEXT_RENDER_THROTTLE_MS = 100;

function same<T>(a: readonly T[], b: readonly T[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

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

function groupMessagesIntoTurns(messages: Message[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let currentTurn: MessageTurn | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = { userMessage: message, assistantMessages: [] };
    } else if (message.role === 'assistant' && currentTurn) {
      currentTurn.assistantMessages.push(message as AssistantMessage);
    }
  }

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
  const sessions = useChatStore((state) => state.sessions);
  const messagesBySession = useChatStore((state) => state.messages);
  const messageMeta = useChatStore((state) => state.messageMeta);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const loadMoreMessages = useChatStore((state) => state.loadMoreMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);

  const resolvedSessionId = useMemo(() => activeSessionId ?? null, [activeSessionId]);
  const activeSession = useMemo(() => {
    if (!resolvedSessionId) return undefined;
    return sessions.find((session) => session.id === resolvedSessionId);
  }, [resolvedSessionId, sessions]);
  const sessionTitle = activeSession?.title ?? '';
  const showTitle = true;
  const titleLabel = sessionTitle.trim().length > 0 ? sessionTitle : 'New session';
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      const label = (session.title ?? session.id).toLowerCase();
      return label.includes(query);
    });
  }, [sessionQuery, sessions]);
  const messages = resolvedSessionId ? messagesBySession[resolvedSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  const revertMessageId = activeSession?.revert?.messageID;
  const visibleMessages = useMemo(() => {
    if (!revertMessageId) return messages;
    return messages.filter((message) => message.id < revertMessageId);
  }, [messages, revertMessageId]);
  const meta = resolvedSessionId ? messageMeta[resolvedSessionId] : undefined;
  const status = resolvedSessionId ? sessionStatus[resolvedSessionId] : undefined;
  const isWorking = status?.type === 'busy' || status?.type === 'retry';

  const turns = useMemo(() => groupMessagesIntoTurns(visibleMessages), [visibleMessages]);
  const lastTurn = turns[turns.length - 1];
  const isLastTurnWorking = isWorking && lastTurn?.userMessage.role === 'user';

  const autoScroll = useAutoScroll({
    working: () => isWorking ?? false,
    onUserInteracted: () => {},
    overflowAnchor: 'auto',
  });

  useEffect(() => {
    if (isWorking) {
      autoScroll.forceScrollToBottom();
    }
  }, [turns.length, isWorking, autoScroll.forceScrollToBottom]);

  const emptyState = !resolvedSessionId
    ? 'Start a new chat to create a session.'
    : visibleMessages.length === 0
      ? 'No messages yet.'
      : null;
  const sessionId = resolvedSessionId ?? '';

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
        style={{ '--session-title-height': showTitle ? '40px' : '0px' } as React.CSSProperties}
      >
        {showTitle && (
          <div className="sticky top-0 z-30 bg-background px-4">
            <div className="h-10 flex items-center justify-between gap-2">
              <Popover open={sessionMenuOpen} onOpenChange={setSessionMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground hover:bg-muted/40"
                    aria-label="Select session"
                  >
                    <span className="truncate max-w-[240px]">{titleLabel}</span>
                    <Icon name="chevron-down" size="small" className="text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-80">
                  <div className="p-2 border-b border-border">
                    <input
                      value={sessionQuery}
                      onChange={(event) => setSessionQuery(event.target.value)}
                      placeholder="Search sessions..."
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                    />
                  </div>
                  <div className="max-h-72 overflow-auto p-1 thin-scrollbar">
                    <button
                      type="button"
                      onClick={() => {
                        setSessionMenuOpen(false);
                        setActiveSession(null).catch(() => undefined);
                      }}
                      className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-xs text-left text-muted-foreground"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'; e.currentTarget.style.color = 'var(--foreground)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}
                    >
                      <Icon name="plus-small" size="small" />
                      New session
                    </button>
                    {filteredSessions.map((session) => {
                      const label = session.title?.trim() || session.id;
                      const isActive = session.id === resolvedSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => {
                            setSessionMenuOpen(false);
                            setActiveSession(session.id).catch(() => undefined);
                          }}
                          className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs text-left text-muted-foreground"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'; e.currentTarget.style.color = 'var(--foreground)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}
                        >
                          <span className="truncate">{label}</span>
                          {isActive && <Icon name="check-small" size="small" className="text-muted-foreground" />}
                        </button>
                      );
                    })}
                    {filteredSessions.length === 0 && (
                      <div className="px-2 py-2 text-xs text-muted-foreground">No sessions found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <button
                type="button"
                onClick={() => {
                  setSessionMenuOpen(false);
                  setActiveSession(null).catch(() => undefined);
                }}
                className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                aria-label="New session"
              >
                <Icon name="plus-small" size="small" />
              </button>
            </div>
          </div>
        )}
        {meta?.hasMore && (
          <div className="flex justify-center bg-background/90 py-2">
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
        <div
          ref={autoScroll.contentRef}
          data-slot="session-turn-list"
          style={{ paddingBottom: 'calc(48px + var(--prompt-dock-height, 0px))' }}
        >
          {emptyState ? (
            <div className="px-4 py-4 text-sm text-muted-foreground">{emptyState}</div>
          ) : (
            turns.map((turn) => (
              <Turn
                key={turn.userMessage.id}
                turn={turn}
                sessionId={sessionId}
                isWorking={isLastTurnWorking && turn === lastTurn}
                onInteract={autoScroll.handleInteraction}
              />
            ))
          )}
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
