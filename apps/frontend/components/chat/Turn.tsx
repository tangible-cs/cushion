'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type {
  Part,
  TextPart,
  ReasoningPart,
  AssistantMessage,
  ToolPart,
} from '@opencode-ai/sdk/v2/client';
import { useChatStore } from '@/stores/chatStore';
import { Markdown } from './Markdown';
import { Icon } from './Icon';
import { DiffSummary } from './DiffView';
import { ToolPartView, AttachmentList } from './ToolPartView';
import { CopyButton } from './CopyButton';
import { HighlightedText, ContextList } from './UserMessageContent';
import { useThrottledValue } from '@/hooks/useThrottledValue';
import {
  type MessageTurn,
  EMPTY_PARTS,
  TEXT_RENDER_THROTTLE_MS,
  getUserText,
  getFiles,
  getLastTextPart,
  isAttachment,
  isAgent,
  isText,
  isReasoning,
  isTool,
  isFile,
  isSnapshot,
  isPatch,
  isStepStart,
  isStepFinish,
  isRetry,
  computeStatusFromPart,
  formatDuration,
} from './message-helpers';

type TurnProps = {
  turn: MessageTurn;
  sessionId: string;
  isWorking: boolean;
  onInteract: () => void;
};

export function Turn({ turn, sessionId, isWorking, onInteract }: TurnProps) {
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
                    className={cn("transition-transform", stepsExpanded && "rotate-180")}
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
    return <div className="text-xs text-accent-red">Retry {part.attempt}</div>;
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
