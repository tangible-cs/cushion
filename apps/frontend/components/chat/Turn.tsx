
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Part,
  TextPart,
  ReasoningPart,
  AssistantMessage,
  UserMessage,
  ToolPart,
} from '@opencode-ai/sdk/v2/client';
import { useChatStore } from '@/stores/chatStore';
import { Markdown } from './Markdown';
import { DiffSummary } from './DiffView';
import { ToolPartView, AttachmentList, ContextToolGroup, CONTEXT_GROUP_TOOLS } from './ToolPartView';
import { CopyButton } from './CopyButton';
import { HighlightedText, ContextList } from './UserMessageContent';
import { useThrottledValue } from '@/hooks/useThrottledValue';
import { Ban } from 'lucide-react';
import {
  type MessageTurn,
  EMPTY_PARTS,
  TEXT_RENDER_THROTTLE_MS,
  getUserText,
  getFiles,
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
  extractReasoningHeading,
  formatDuration,
  buildFooterMeta,
  resolveModelName,
  isInterrupted,
  unwrapError,
} from './message-helpers';
import { TextShimmer } from './TextShimmer';

type TurnProps = {
  turn: MessageTurn;
  sessionId: string;
  isWorking: boolean;
  onInteract: () => void;
  showThinking?: boolean;
};

export function Turn({ turn, sessionId, isWorking, onInteract, showThinking = true }: TurnProps) {
  const [duration, setDuration] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const parts = useChatStore((state) => state.parts[turn.userMessage.id] ?? EMPTY_PARTS);
  const sessionStatus = useChatStore((state) => state.sessionStatus[sessionId]);

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

  const status = useMemo(() => {
    if (!isWorking) return undefined;
    const lastPart = allAssistantParts[allAssistantParts.length - 1];
    return computeStatusFromPart(lastPart);
  }, [isWorking, allAssistantParts]);

  const isThinking = useMemo(() => {
    if (!isWorking) return false;
    const lastPart = allAssistantParts[allAssistantParts.length - 1];
    return !lastPart || lastPart.type === 'reasoning' || lastPart.type === 'text';
  }, [isWorking, allAssistantParts]);

  const reasoningHeading = useMemo(() => {
    if (!isWorking) return undefined;
    for (let i = allAssistantParts.length - 1; i >= 0; i--) {
      const part = allAssistantParts[i];
      if (part.type === 'reasoning' && part.text) {
        return extractReasoningHeading(part.text);
      }
    }
    return undefined;
  }, [isWorking, allAssistantParts]);

  const hasAssistantContent = turn.assistantMessages.length > 0;
  const lastAssistant = turn.assistantMessages[turn.assistantMessages.length - 1];
  const lastAssistantId = lastAssistant?.id;
  const providers = useChatStore((state) => state.providers);

  const lastTextPartId = useMemo(() => {
    for (let i = allAssistantParts.length - 1; i >= 0; i--) {
      const p = allAssistantParts[i];
      if (isText(p) && !p.synthetic && p.text?.trim()) return p.id;
    }
    return undefined;
  }, [allAssistantParts]);

  const footerMeta = useMemo(() => {
    if (!lastAssistant || isWorking) return undefined;
    const userCreated = (turn.userMessage as { time?: { created?: number } }).time?.created;
    let durationStr = '';
    if (typeof userCreated === 'number') {
      const end = turn.assistantMessages.reduce<number | undefined>((max, msg) => {
        const completed = msg.time.completed;
        if (typeof completed !== 'number') return max;
        if (max === undefined) return completed;
        return Math.max(max, completed);
      }, undefined);
      if (typeof end === 'number' && end >= userCreated) {
        durationStr = formatDuration(userCreated, end);
      }
    }
    const meta = buildFooterMeta(lastAssistant, providers, durationStr);
    if (!meta) return undefined;
    return { meta, interrupted: isInterrupted(lastAssistant) };
  }, [lastAssistant, isWorking, turn.assistantMessages, turn.userMessage, providers]);

  const generationError = useMemo(() => {
    const errMsg = turn.assistantMessages.find(
      (m) => m.error && m.error.name !== 'MessageAbortedError',
    );
    if (!errMsg?.error) return undefined;
    const raw = (errMsg.error as { data?: { message?: unknown } }).data?.message;
    if (raw === undefined || raw === null) return undefined;
    return unwrapError(typeof raw === 'string' ? raw : String(raw));
  }, [turn.assistantMessages]);
  const diffSummary = useMemo(() => {
    const raw =
      turn.userMessage.summary &&
      typeof turn.userMessage.summary === 'object' &&
      'diffs' in turn.userMessage.summary
        ? ((turn.userMessage.summary.diffs ?? []) as import('@opencode-ai/sdk/v2/client').FileDiff[])
        : [];
    if (raw.length === 0) return raw;
    // Deduplicate: last diff per file wins, preserve order
    const seen = new Set<string>();
    return raw
      .reduceRight<import('@opencode-ai/sdk/v2/client').FileDiff[]>((result, diff) => {
        if (seen.has(diff.file)) return result;
        seen.add(diff.file);
        result.push(diff);
        return result;
      }, [])
      .reverse();
  }, [turn.userMessage.summary]);

  const userMeta = useMemo(() => {
    const msg = turn.userMessage as UserMessage;
    const agent = msg.agent;
    const model = msg.model ? resolveModelName(providers, msg.model.providerID, msg.model.modelID) : '';
    const created = msg.time?.created;
    let stamp = '';
    if (typeof created === 'number') {
      const date = new Date(created);
      const hours = date.getHours();
      const hour12 = hours % 12 || 12;
      const minute = String(date.getMinutes()).padStart(2, '0');
      stamp = `${hour12}:${minute} ${hours < 12 ? 'AM' : 'PM'}`;
    }
    const head = [agent ? agent[0].toUpperCase() + agent.slice(1) : '', model].filter(Boolean).join('\u00A0\u00B7\u00A0');
    const tail = stamp;
    if (!head && !tail) return undefined;
    return { head, tail };
  }, [turn.userMessage, providers]);

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
                <>
                  <div data-slot="user-message-text" className="text-sm">
                    <HighlightedText text={textPart.text ?? ''} fileRefs={inlineFiles} agentRefs={agentParts} />
                  </div>
                  {textPart.text && (
                    <div data-slot="user-message-copy-wrapper">
                      {userMeta && (
                        <span data-slot="user-message-meta-wrap">
                          {userMeta.head && (
                            <span data-slot="user-message-meta">{userMeta.head}</span>
                          )}
                          {userMeta.head && userMeta.tail && (
                            <span data-slot="user-message-meta-sep">{'\u00A0\u00B7\u00A0'}</span>
                          )}
                          {userMeta.tail && (
                            <span data-slot="user-message-meta-tail">{userMeta.tail}</span>
                          )}
                        </span>
                      )}
                      <CopyButton text={textPart.text} label="Copy message" />
                    </div>
                  )}
                </>
              )}
            </div>
            {contextFiles.length > 0 && <ContextList parts={contextFiles} />}
          </div>

          {isWorking && (
            <div data-slot="session-turn-response-trigger">
              {isThinking ? (
                <div data-slot="session-turn-thinking">
                  <TextShimmer text="Thinking..." />
                  {reasoningHeading && (
                    <span data-slot="session-turn-thinking-heading">{reasoningHeading}</span>
                  )}
                  {duration && <span data-slot="session-turn-thinking-duration">· {duration}</span>}
                </div>
              ) : (
                <div
                  data-slot="session-turn-collapsible-trigger-content"
                  className="flex items-center gap-2 text-xs text-muted-foreground w-full text-left"
                >
                  <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span data-slot="session-turn-status-text">
                    {status ?? 'Working...'}
                  </span>
                  {duration && <span className="text-muted-foreground">· {duration}</span>}
                  {sessionStatus?.type === 'retry' && (
                    <span className="text-muted-foreground">
                      · Retrying #{(sessionStatus as { attempt: number }).attempt}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {hasAssistantContent && (
          <div data-slot="session-turn-assistant-parts">
            {turn.assistantMessages.map((msg) => (
              <AssistantPartsMessage
                key={msg.id}
                message={msg}
                showThinking={showThinking}
                lastTextPartId={lastTextPartId}
                footerMeta={footerMeta}
              />
            ))}
          </div>
        )}

        {generationError && (
          <div data-component="generation-error">
            <Ban size={14} className="generation-error-icon" />
            <span>{generationError}</span>
          </div>
        )}

        {diffSummary.length > 0 && !isWorking && (
          <div data-slot="session-turn-diff-section">
            <DiffSummary diffs={diffSummary} />
          </div>
        )}

        {!isWorking && footerMeta?.interrupted && (
          <div data-component="message-divider">
            <span data-slot="message-divider-line" />
            <span data-slot="message-divider-label">Interrupted</span>
            <span data-slot="message-divider-line" />
          </div>
        )}
      </div>
    </div>
  );
}

type FooterMeta = { meta: string; interrupted: boolean };

type AssistantPartsMessageProps = {
  message: AssistantMessage;
  showThinking?: boolean;
  lastTextPartId?: string;
  footerMeta?: FooterMeta;
};

const HIDDEN_TOOLS = new Set(['todoread', 'todowrite']);

type GroupedItem =
  | { type: 'part'; part: Part; key: string }
  | { type: 'context'; parts: ToolPart[]; key: string };

function groupParts(parts: Part[], showThinking: boolean): GroupedItem[] {
  const items: GroupedItem[] = [];
  let contextBuffer: ToolPart[] = [];

  const flushContext = () => {
    if (contextBuffer.length > 0) {
      items.push({ type: 'context', parts: contextBuffer, key: `ctx:${contextBuffer[0].id}` });
      contextBuffer = [];
    }
  };

  for (const part of parts) {
    if (isTool(part) && HIDDEN_TOOLS.has(part.tool)) continue;
    if (isReasoning(part) && !showThinking) continue;

    if (isTool(part) && CONTEXT_GROUP_TOOLS.has(part.tool)) {
      contextBuffer.push(part);
      continue;
    }

    flushContext();
    items.push({ type: 'part', part, key: `part:${part.id}` });
  }

  flushContext();
  return items;
}

const AssistantPartsMessage = memo(function AssistantPartsMessage({
  message,
  showThinking = true,
  lastTextPartId,
  footerMeta,
}: AssistantPartsMessageProps) {
  const parts = useChatStore((state) => state.parts[message.id] ?? EMPTY_PARTS);
  const grouped = useMemo(() => groupParts(parts, showThinking), [parts, showThinking]);

  return (
    <div className="space-y-2">
      {grouped.map((item) =>
        item.type === 'context' ? (
          <ContextToolGroup key={item.key} parts={item.parts} />
        ) : (
          <PartView
            key={item.key}
            part={item.part}
            showThinking={showThinking}
            lastTextPartId={lastTextPartId}
            footerMeta={footerMeta}
          />
        ),
      )}
    </div>
  );
});

const PartView = memo(function PartView({ part, showThinking = true, lastTextPartId, footerMeta }: { part: Part; showThinking?: boolean; lastTextPartId?: string; footerMeta?: FooterMeta }) {
  if (isText(part) && !part.synthetic) {
    const isLast = part.id === lastTextPartId;
    return <TextPartView part={part} footerMeta={isLast ? footerMeta : undefined} />;
  }
  if (isReasoning(part)) {
    if (!showThinking) return null;
    return <ReasoningPartView part={part} />;
  }
  if (isTool(part)) {
    return <ToolPartView part={part} />;
  }
  if (isFile(part)) {
    return <AttachmentList parts={[part]} />;
  }
  if (isSnapshot(part)) {
    return null;
  }
  if (isPatch(part)) {
    return null;
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

const TextPartView = memo(function TextPartView({ part, footerMeta }: { part: TextPart; footerMeta?: FooterMeta }) {
  const text = useThrottledValue(part.text ?? '', TEXT_RENDER_THROTTLE_MS);
  if (!text) return null;
  return (
    <div data-component="text-part" className="text-sm">
      <Markdown text={text} cacheKey={part.id} />
      {footerMeta && (
        <div data-slot="text-part-copy-wrapper" data-interrupted={footerMeta.interrupted || undefined}>
          <CopyButton text={text} label="Copy response" />
          <span data-slot="text-part-meta">{footerMeta.meta}</span>
        </div>
      )}
    </div>
  );
});

const ReasoningPartView = memo(function ReasoningPartView({ part }: { part: ReasoningPart }) {
  const text = useThrottledValue(part.text ?? '', TEXT_RENDER_THROTTLE_MS);
  if (!text) return null;
  return (
    <div data-component="reasoning-part">
      <Markdown text={text} cacheKey={part.id} />
    </div>
  );
});

