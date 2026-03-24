
import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, type PromptInputPayload } from '@/stores/chatStore';
import { MessageList } from './MessageList';
import { PromptInput } from './PromptInput';
import { TodoDock } from './TodoDock';
import { QuestionDock } from './QuestionDock';
import { useToast } from './Toast';


export function ChatSidebar() {
  const connection = useChatStore((state) => state.connection);
  const sendPrompt = useChatStore((state) => state.sendPrompt);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sessionErrors = useChatStore((state) => state.sessionErrors);
  const providerAuthErrors = useChatStore((state) => state.providerAuthErrors);
  const questions = useChatStore((state) => state.questions);
  const replyToQuestion = useChatStore((state) => state.replyToQuestion);
  const rejectQuestion = useChatStore((state) => state.rejectQuestion);
  const todos = useChatStore((state) => state.todos);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const isConnected = connection.status === 'connected' || connection.status === 'reconnecting';
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
      setShowDock(false);
      return;
    }
    if (allDone) {
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
