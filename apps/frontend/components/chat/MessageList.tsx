
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Blocks, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useAutoScroll } from './useAutoScroll';
import { Icon } from './Icon';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Turn } from './Turn';
import { DisplayOptionsPopover } from './DisplayOptionsPopover';
import { SessionContextUsage } from './SessionContextUsage';
import { CustomizeDialog } from './CustomizeDialog';
import { MessageDivider } from './MessageDivider';
import { groupMessagesIntoTurns, EMPTY_MESSAGES } from './message-helpers';

type MessageListProps = {
  className?: string;
};

export function MessageList({ className }: MessageListProps) {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sessions = useChatStore((state) => state.sessions);
  const messagesBySession = useChatStore((state) => state.messages);
  const messageMeta = useChatStore((state) => state.messageMeta);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const loadMoreMessages = useChatStore((state) => state.loadMoreMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const showThinking = useChatStore((s) => s.displayPreferences.showThinking);
  const compactedSessions = useChatStore((s) => s.compactedSessions);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [showCustomizeDialog, setShowCustomizeDialog] = useState(false);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return undefined;
    return sessions.find((session) => session.id === activeSessionId);
  }, [activeSessionId, sessions]);
  const sessionTitle = activeSession?.title ?? '';
  const titleLabel = sessionTitle.trim().length > 0 ? sessionTitle : 'New session';
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      const label = (session.title ?? session.id).toLowerCase();
      return label.includes(query);
    });
  }, [sessionQuery, sessions]);

  useEffect(() => {
    if (sessionMenuOpen) return;
    setSessionQuery('');
  }, [sessionMenuOpen]);

  const messages = activeSessionId ? messagesBySession[activeSessionId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES;
  const revertMessageId = activeSession?.revert?.messageID;
  const visibleMessages = useMemo(() => {
    if (!revertMessageId) return messages;
    return messages.filter((message) => message.id < revertMessageId);
  }, [messages, revertMessageId]);
  const meta = activeSessionId ? messageMeta[activeSessionId] : undefined;
  const status = activeSessionId ? sessionStatus[activeSessionId] : undefined;
  const isWorking = status?.type === 'busy' || status?.type === 'retry';

  const turns = useMemo(() => groupMessagesIntoTurns(visibleMessages), [visibleMessages]);
  const lastTurn = turns[turns.length - 1];
  const isLastTurnWorking = isWorking && lastTurn?.userMessage.role === 'user';

  const autoScroll = useAutoScroll({
    working: () => isWorking ?? false,
    onUserInteracted: () => {},
    overflowAnchor: 'auto',
  });

  const prevTurnCount = useRef(turns.length);
  useEffect(() => {
    const grew = turns.length > prevTurnCount.current;
    prevTurnCount.current = turns.length;
    if (grew || isWorking) {
      autoScroll.forceScrollToBottom();
    }
  }, [turns.length, isWorking, autoScroll.forceScrollToBottom]);

  const emptyState = !activeSessionId
    ? 'Start a new chat to create a session.'
    : visibleMessages.length === 0
      ? 'No messages yet.'
      : null;
  const sessionId = activeSessionId ?? '';

  return (
    <div className={cn("relative flex-1 min-h-0", className)}>
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
        className="h-full overflow-auto thin-scrollbar"
        ref={autoScroll.scrollRef}
        onScroll={autoScroll.handleScroll}
        data-slot="session-turn-content"
        style={{ '--session-title-height': '40px' } as React.CSSProperties}
      >
        <div className="sticky top-0 z-30 bg-sidebar-bg px-4">
            <div className="h-10 flex items-center justify-between gap-2">
              <Popover open={sessionMenuOpen} onOpenChange={setSessionMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'group flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent bg-transparent px-2 py-1 text-[14px] font-normal text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none',
                      sessionMenuOpen && 'bg-[var(--overlay-10)]'
                    )}
                    aria-label="Select session"
                  >
                    <span className="truncate max-w-[240px] text-[14px] font-normal text-foreground">{titleLabel}</span>
                    <Icon name="chevron-down" size="small" className="shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="max-h-80 overflow-hidden p-2 flex flex-col !bg-surface-elevated !border-border">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface px-2">
                      <Search size={16} className="shrink-0 text-muted-foreground" />
                      <input
                        value={sessionQuery}
                        onChange={(event) => setSessionQuery(event.target.value)}
                        placeholder="Search sessions"
                        className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                        autoFocus
                      />
                      {sessionQuery.trim().length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSessionQuery('')}
                          className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Clear search"
                        >
                          <Icon name="close" size="small" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar">
                    <div className="sticky top-0 z-10 relative px-2 py-2 text-[13px] font-medium text-[var(--foreground-subtle)] bg-[var(--surface-elevated)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[var(--surface-elevated)] after:to-transparent">
                      Sessions
                    </div>
                    <div className="space-y-0.5 pb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setSessionMenuOpen(false);
                          setActiveSession(null).catch(() => undefined);
                        }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-[14px] font-normal text-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Icon name="plus-small" size="small" className="shrink-0 text-muted-foreground" />
                          <span className="truncate flex-1">New session</span>
                        </div>
                      </button>
                      {filteredSessions.map((session) => {
                        const label = session.title?.trim() || session.id;
                        const isActive = session.id === activeSessionId;
                        return (
                          <button
                            key={session.id}
                            type="button"
                            onClick={() => {
                              setSessionMenuOpen(false);
                              setActiveSession(session.id).catch(() => undefined);
                            }}
                            className="w-full rounded-md px-2 py-1.5 text-left text-[14px] font-normal text-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none transition-colors"
                            title={label}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate flex-1">{label}</span>
                              {isActive && <Icon name="check-small" size="small" className="shrink-0 text-foreground" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {filteredSessions.length === 0 && (
                      <div className="px-3 py-8 text-sm text-muted-foreground text-center">No sessions found</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-1">
                <SessionContextUsage />
                <button
                  type="button"
                  onClick={() => setShowCustomizeDialog(true)}
                  className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
                  aria-label="Customize"
                  title="Customize"
                >
                  <Blocks className="size-3.5" />
                </button>
                <DisplayOptionsPopover />
                <button
                  type="button"
                  onClick={() => {
                    setSessionMenuOpen(false);
                    setActiveSession(null).catch(() => undefined);
                  }}
                  className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
                  aria-label="New session"
                  title="New session"
                >
                  <Icon name="plus-small" size="small" />
                </button>
              </div>
            </div>
          </div>
        {meta?.hasMore && (
          <div className="flex justify-center bg-sidebar-bg py-2">
            <button
              type="button"
              disabled={meta.loading}
              onClick={() => {
                if (!activeSessionId) return;
                loadMoreMessages(activeSessionId).catch(() => undefined);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] disabled:opacity-50 transition-colors"
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
            <>
            {compactedSessions[sessionId] && (
              <MessageDivider label="Session compacted" />
            )}
            {turns.map((turn) => (
              <Turn
                key={turn.userMessage.id}
                turn={turn}
                sessionId={sessionId}
                isWorking={isLastTurnWorking && turn === lastTurn}
                onInteract={autoScroll.handleInteraction}
                showThinking={showThinking}
              />
            ))}
            </>
          )}
        </div>
      </div>
      {showCustomizeDialog && <CustomizeDialog onClose={() => setShowCustomizeDialog(false)} />}
    </div>
  );
}
