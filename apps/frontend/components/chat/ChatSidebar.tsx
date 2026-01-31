'use client';

import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useChatStore, type PromptInputPayload } from '@/stores/chatStore';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import type { PermissionRequest, QuestionRequest } from '@opencode-ai/sdk/v2/client';

const statusLabel: Record<string, string> = {
  idle: 'Idle',
  connecting: 'Connecting',
  connected: 'Connected',
  reconnecting: 'Reconnecting',
  error: 'Error',
};

export function ChatSidebar() {
  const connection = useChatStore((state) => state.connection);
  const baseUrl = useChatStore((state) => state.baseUrl);
  const directory = useChatStore((state) => state.directory);
  const sendPrompt = useChatStore((state) => state.sendPrompt);
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sessionErrors = useChatStore((state) => state.sessionErrors);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const setBaseUrl = useChatStore((state) => state.setBaseUrl);
  const providerAuthErrors = useChatStore((state) => state.providerAuthErrors);
  const clearProviderAuthError = useChatStore((state) => state.clearProviderAuthError);
  const requestProviderAuth = useChatStore((state) => state.requestProviderAuth);
  const permissions = useChatStore((state) => state.permissions);
  const questions = useChatStore((state) => state.questions);
  const respondToPermission = useChatStore((state) => state.respondToPermission);
  const replyToQuestion = useChatStore((state) => state.replyToQuestion);
  const rejectQuestion = useChatStore((state) => state.rejectQuestion);
  const isConnected = connection.status === 'connected';
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [promptHeight, setPromptHeight] = useState(160);
  const activeSessionError = activeSessionId ? sessionErrors[activeSessionId] : undefined;
  const pendingPermissions = activeSessionId ? permissions[activeSessionId] ?? [] : [];
  const pendingQuestions = activeSessionId ? questions[activeSessionId] ?? [] : [];

  useEffect(() => {
    setDraftBaseUrl(baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('cushion-prompt-height');
    if (!stored) return;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return;
    setPromptHeight(parsed);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cushion-prompt-height', String(promptHeight));
  }, [promptHeight]);

  const handleSubmit = useCallback((value: PromptInputPayload) => {
    sendPrompt(value).catch((error) => {
      console.error('[ChatSidebar] Failed to send prompt:', error);
    });
  }, [sendPrompt]);

  const promptMin = 120;
  const promptMax = typeof window !== 'undefined'
    ? Math.max(promptMin, Math.min(360, Math.floor(window.innerHeight * 0.6)))
    : 360;
  const resolvedPromptHeight = Math.min(promptMax, Math.max(promptMin, promptHeight));
  const rootStyle = {
    '--prompt-height': `${resolvedPromptHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    if (resolvedPromptHeight === promptHeight) return;
    setPromptHeight(resolvedPromptHeight);
  }, [promptHeight, resolvedPromptHeight]);

  return (
    <div className="h-full flex flex-col" style={rootStyle}>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Chat</div>
          <div
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: 'var(--md-bg-secondary, #242424)',
              color: connection.status === 'error' ? 'var(--md-danger, #ff6b6b)' : 'var(--md-text-muted, #a0a0a0)',
            }}
          >
            {statusLabel[connection.status] ?? 'Unknown'}
          </div>
        </div>
        {connection.status === 'error' && connection.error && (
          <div className="mt-2 text-xs text-red-400 break-words">{connection.error}</div>
        )}
        {activeSessionError && (
          <div className="mt-2 text-xs text-red-400 break-words">{activeSessionError}</div>
        )}
        <div className="mt-2">
          <div className="text-[11px] text-muted-foreground">OpenCode URL</div>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={draftBaseUrl}
              onChange={(event) => setDraftBaseUrl(event.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              placeholder="http://localhost:4096"
            />
            <button
              type="button"
              onClick={() => {
                setBaseUrl(draftBaseUrl).catch(() => undefined);
              }}
              disabled={draftBaseUrl.trim().length === 0 || draftBaseUrl.trim() === baseUrl}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Update
            </button>
          </div>
        </div>
        {Object.keys(providerAuthErrors).length > 0 && (
          <div className="mt-2 space-y-2">
            {Object.entries(providerAuthErrors).map(([providerID, message]) => (
              <div key={providerID} className="rounded-md border border-border bg-muted/20 p-2 text-xs">
                <div className="text-muted-foreground">Provider auth required</div>
                <div className="mt-1 text-foreground">{providerID}</div>
                <div className="mt-1 text-muted-foreground">{message}</div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      requestProviderAuth(providerID).then((url) => {
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      }).catch(() => undefined);
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Authorize
                  </button>
                  <button
                    type="button"
                    onClick={() => clearProviderAuthError(providerID)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2">
          <select
            value={activeSessionId ?? ''}
            onChange={(event) => {
              const next = event.target.value || null;
              setActiveSession(next).catch(() => undefined);
            }}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
          >
            <option value="">New session</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.title || session.id}
              </option>
            ))}
          </select>
        </div>
        {directory && (
          <div className="mt-1 text-[11px] text-muted-foreground truncate" title={directory}>
            {directory}
          </div>
        )}
      </div>

      <MessageList className="flex-1" />

      {(pendingPermissions.length > 0 || pendingQuestions.length > 0) && (
        <div className="border-t border-border px-4 py-3 space-y-3">
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

      <div className="relative" style={{ height: resolvedPromptHeight }}>
        <ResizeHandle
          direction="vertical"
          size={resolvedPromptHeight}
          min={promptMin}
          max={promptMax}
          onResize={setPromptHeight}
        />
        <PromptInput
          className="h-full flex flex-col"
          editorWrapperClassName="flex-1 min-h-0"
          disabled={!isConnected}
          placeholder={isConnected ? 'Ask the workspace...' : 'Connect to OpenCode to start chatting'}
          onSubmit={handleSubmit}
        />
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