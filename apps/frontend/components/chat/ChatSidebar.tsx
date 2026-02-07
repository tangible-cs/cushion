'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore, type PromptInputPayload } from '@/stores/chatStore';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import type { PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2/client';

export function ChatSidebar() {
  const connection = useChatStore((state) => state.connection);
  const sendPrompt = useChatStore((state) => state.sendPrompt);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const permissions = useChatStore((state) => state.permissions);
  const questions = useChatStore((state) => state.questions);
  const respondToPermission = useChatStore((state) => state.respondToPermission);
  const replyToQuestion = useChatStore((state) => state.replyToQuestion);
  const rejectQuestion = useChatStore((state) => state.rejectQuestion);
  const isConnected = connection.status === 'connected';
  const pendingPermissions = activeSessionId ? permissions[activeSessionId] ?? [] : [];
  const pendingQuestions = activeSessionId ? questions[activeSessionId] ?? [] : [];
  const promptDockRef = useRef<HTMLDivElement | null>(null);
  const [promptDockHeight, setPromptDockHeight] = useState(0);

  const handleSubmit = useCallback((value: PromptInputPayload) => {
    sendPrompt(value).catch((error) => {
      console.error('[ChatSidebar] Failed to send prompt:', error);
    });
  }, [sendPrompt]);

  useEffect(() => {
    const node = promptDockRef.current;
    if (!node) return undefined;
    const update = () => {
      setPromptDockHeight(Math.ceil(node.getBoundingClientRect().height));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="h-full flex flex-col relative"
      style={{ '--prompt-dock-height': `${promptDockHeight}px` } as React.CSSProperties}
    >
      <MessageList className="flex-1 min-h-0" />

      <div className="absolute inset-x-0 bottom-0 pt-10 pb-4 flex flex-col items-center z-30 px-4 bg-gradient-to-t from-background via-background to-transparent pointer-events-none chat-dock">
        <div ref={promptDockRef} className="w-full flex flex-col gap-3 pointer-events-auto">
          {(pendingPermissions.length > 0 || pendingQuestions.length > 0) && (
            <div className="chat-dock-panel rounded-md border border-border bg-background/90 px-3 py-3 space-y-3">
              {pendingPermissions.length > 0 && (
                <PermissionPanel
                  requests={pendingPermissions}
                  onRespond={(input) => respondToPermission(input).catch(() => undefined)}
                />
              )}
              {pendingQuestions.length > 0 && (
                <QuestionPanel
                  requests={pendingQuestions}
                  onReply={(input) => replyToQuestion(input).catch(() => undefined)}
                  onReject={(input) => rejectQuestion(input).catch(() => undefined)}
                />
              )}
            </div>
          )}

          <PromptInput
            className="flex flex-col"
            disabled={!isConnected}
            placeholder={isConnected ? 'Ask workspace...' : 'Connect to OpenCode to start chatting'}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}

type PermissionPanelProps = {
  requests: PermissionRequest[];
  onRespond: (input: { sessionID: string; permissionID: string; response: 'once' | 'always' | 'reject' }) => void;
};

function PermissionPanel({ requests, onRespond }: PermissionPanelProps) {
  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <div key={request.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs">
          <div className="text-muted-foreground">Permission required</div>
          <div className="mt-1 text-foreground">{request.permission}</div>
          {request.patterns?.length > 0 && (
            <div className="mt-1 text-muted-foreground">{request.patterns.join(', ')}</div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRespond({ sessionID: request.sessionID, permissionID: request.id, response: 'once' })}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Allow once
            </button>
            <button
              type="button"
              onClick={() => onRespond({ sessionID: request.sessionID, permissionID: request.id, response: 'always' })}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Always allow
            </button>
            <button
              type="button"
              onClick={() => onRespond({ sessionID: request.sessionID, permissionID: request.id, response: 'reject' })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type QuestionPanelProps = {
  requests: QuestionRequest[];
  onReply: (input: { requestID: string; answers: string[][] }) => void;
  onReject: (input: { requestID: string }) => void;
};

function QuestionPanel({ requests, onReply, onReject }: QuestionPanelProps) {
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <QuestionCard key={request.id} request={request} onReply={onReply} onReject={onReject} />
      ))}
    </div>
  );
}

type QuestionCardProps = {
  request: QuestionRequest;
  onReply: (input: { requestID: string; answers: string[][] }) => void;
  onReject: (input: { requestID: string }) => void;
};

function QuestionCard({ request, onReply, onReject }: QuestionCardProps) {
  const [answers, setAnswers] = useState<string[][]>(() => request.questions.map(() => []));
  const [customInputs, setCustomInputs] = useState<string[]>(() => request.questions.map(() => ''));
  const canSubmit = useMemo(
    () => request.questions.every((_, index) => (answers[index]?.length ?? 0) > 0),
    [answers, request.questions]
  );

  const updateAnswer = (index: number, label: string, multiple: boolean) => {
    setAnswers((prev) => {
      const next = prev.map((entry) => entry.slice());
      const current = next[index] ?? [];
      if (multiple) {
        const exists = current.includes(label);
        next[index] = exists ? current.filter((item) => item !== label) : [...current, label];
        return next;
      }
      next[index] = [label];
      return next;
    });
  };

  const addCustom = (index: number, multiple: boolean) => {
    const value = customInputs[index]?.trim();
    if (!value) return;
    setAnswers((prev) => {
      const next = prev.map((entry) => entry.slice());
      const current = next[index] ?? [];
      if (multiple) {
        if (!current.includes(value)) next[index] = [...current, value];
      } else {
        next[index] = [value];
      }
      return next;
    });
    setCustomInputs((prev) => {
      const next = prev.slice();
      next[index] = '';
      return next;
    });
  };

  return (
    <div className="rounded-md border border-border bg-muted/10 p-2 text-xs">
      {request.questions.map((question, index) => {
        const selected = answers[index] ?? [];
        const multiple = question.multiple === true;
        const allowCustom = question.custom !== false;
        return (
          <div key={`${request.id}-${question.header}`} className="space-y-2">
            <div className="text-[11px] uppercase text-muted-foreground">{question.header}</div>
            <div className="text-foreground">{question.question}</div>
            {multiple && (
              <div className="text-[11px] text-muted-foreground">Select all that apply</div>
            )}
            <div className="flex flex-wrap gap-2">
              {question.options.map((opt) => {
                const active = selected.includes(opt.label);
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => updateAnswer(index, opt.label, multiple)}
                    className={`rounded-md border px-2 py-1 text-xs ${
                      active
                        ? 'border-[var(--md-accent)] text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {allowCustom && (
              <div className="flex items-center gap-2">
                <input
                  value={customInputs[index] ?? ''}
                  onChange={(event) => {
                    const next = customInputs.slice();
                    next[index] = event.target.value;
                    setCustomInputs(next);
                  }}
                  placeholder="Type your own answer"
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => addCustom(index, multiple)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {multiple ? 'Add' : 'Set'}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onReject({ requestID: request.id })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => onReply({ requestID: request.id, answers })}
          disabled={!canSubmit}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
