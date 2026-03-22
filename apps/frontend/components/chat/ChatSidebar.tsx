
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, type PromptInputPayload } from '@/stores/chatStore';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import { TodoDock } from './TodoDock';
import { QuestionDock } from './QuestionDock';
import { useToast } from './Toast';
import type { PermissionRequest } from '@opencode-ai/sdk/v2/client';

export function ChatSidebar() {
  const connection = useChatStore((state) => state.connection);
  const sendPrompt = useChatStore((state) => state.sendPrompt);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sessionErrors = useChatStore((state) => state.sessionErrors);
  const providerAuthErrors = useChatStore((state) => state.providerAuthErrors);
  const permissions = useChatStore((state) => state.permissions);
  const questions = useChatStore((state) => state.questions);
  const respondToPermission = useChatStore((state) => state.respondToPermission);
  const replyToQuestion = useChatStore((state) => state.replyToQuestion);
  const rejectQuestion = useChatStore((state) => state.rejectQuestion);
  const autoAccept = useChatStore((state) => state.autoAccept);
  const todos = useChatStore((state) => state.todos);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const isConnected = connection.status === 'connected' || connection.status === 'reconnecting';
  const allPendingPermissions = activeSessionId ? permissions[activeSessionId] ?? [] : [];
  // Filter out edit permissions — they're handled by inline diff review in the editor
  const pendingPermissions = allPendingPermissions.filter((p) => p.permission !== 'edit');
  const pendingQuestions = activeSessionId ? questions[activeSessionId] ?? [] : [];
  const promptDockRef = useRef<HTMLDivElement | null>(null);
  const [promptDockHeight, setPromptDockHeight] = useState(0);
  const [showDock, setShowDock] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const { showToast } = useToast();

  const sessionError = activeSessionId ? sessionErrors[activeSessionId] : undefined;
  const hasProviderAuthError = Object.keys(providerAuthErrors).length > 0;

  const sessionTodos = activeSessionId ? todos[activeSessionId] ?? [] : [];
  const status = activeSessionId ? sessionStatus[activeSessionId] : undefined;
  const isBusy = status?.type === 'busy' || status?.type === 'retry';
  const allDone = sessionTodos.length > 0 && sessionTodos.every((t) => t.status === 'completed' || t.status === 'cancelled');

  useEffect(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;

    if (sessionTodos.length === 0) {
      setShowDock(false);
      return;
    }
    if (!isBusy && !allDone) {
      // Session ended but todos not complete — clear after brief delay
      setShowDock(false);
      return;
    }
    if (allDone) {
      // All done — close after 400ms
      closeTimer.current = window.setTimeout(() => setShowDock(false), 400);
      return;
    }
    setShowDock(true);
  }, [sessionTodos, isBusy, allDone]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const handleSubmit = useCallback((value: PromptInputPayload) => {
    sendPrompt(value).catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to send message.';
      showToast({ variant: 'error', description: message });
    });
  }, [sendPrompt, showToast]);

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
      data-chat-theme="opencode"
      style={{ '--prompt-dock-height': `${promptDockHeight}px` } as React.CSSProperties}
    >
      <MessageList className="flex-1 min-h-0" />

      <div className="absolute inset-x-0 bottom-0 pt-10 pb-4 flex flex-col items-center z-30 px-4 bg-gradient-to-t from-sidebar-bg via-sidebar-bg to-transparent pointer-events-none chat-dock">
        <div ref={promptDockRef} className="w-full flex flex-col gap-3 pointer-events-auto">
          {showDock && sessionTodos.length > 0 && (
            <TodoDock todos={sessionTodos} />
          )}
          {sessionError && (
            <SessionErrorBanner
              message={sessionError}
              isAuthError={hasProviderAuthError}
            />
          )}
          {!autoAccept && pendingPermissions.length > 0 && (
            <div className="chat-dock-panel rounded-md border border-border bg-background/90 px-3 py-3 space-y-3">
              <PermissionPanel
                requests={pendingPermissions}
                onRespond={(input) => respondToPermission(input).catch(() => undefined)}
              />
            </div>
          )}
          {pendingQuestions.map((request) => (
            <QuestionDock
              key={request.id}
              request={request}
              onReply={(input) => replyToQuestion(input).catch(() => undefined)}
              onReject={(input) => rejectQuestion(input).catch(() => undefined)}
            />
          ))}

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
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            >
              Allow once
            </button>
            <button
              type="button"
              onClick={() => onRespond({ sessionID: request.sessionID, permissionID: request.id, response: 'always' })}
              className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            >
              Always allow
            </button>
            <button
              type="button"
              onClick={() => onRespond({ sessionID: request.sessionID, permissionID: request.id, response: 'reject' })}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

type SessionErrorBannerProps = {
  message: string;
  isAuthError: boolean;
};

function SessionErrorBanner({ message, isAuthError }: SessionErrorBannerProps) {
  return (
    <div className="rounded-md border border-[color-mix(in_srgb,var(--accent-red)_20%,var(--border))] bg-[var(--accent-red-12)] px-3 py-2 text-xs text-accent-red">
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5">!</span>
        <div className="min-w-0">
          <div className="break-words">{message}</div>
          {isAuthError && (
            <div className="mt-1 text-muted-foreground">
              Check provider credentials in Settings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
