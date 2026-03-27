
import { useMemo, useState } from 'react';
import { ProgressCircle } from './ProgressCircle';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import type { Message, AssistantMessage } from '@opencode-ai/sdk/v2/client';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-foreground">{value}</span>
    </div>
  );
}

type SessionContextUsageProps = {
  variant?: 'button' | 'indicator';
};

export function SessionContextUsage({ variant = 'button' }: SessionContextUsageProps) {
  const [open, setOpen] = useState(false);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const messages = useChatStore((state) => state.messages);
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const sessionMessages = activeSessionId ? messages[activeSessionId] || [] : [];

  const cost = useMemo(() => {
    const total = sessionMessages.reduce((sum: number, x: Message) => sum + (x.role === 'assistant' ? (x.cost || 0) : 0), 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total);
  }, [sessionMessages]);

  const context = useMemo(() => {
    const resolveTotal = (message: AssistantMessage | undefined) =>
      (message?.tokens?.input || 0)
      + (message?.tokens?.output || 0)
      + (message?.tokens?.reasoning || 0)
      + (message?.tokens?.cache?.read || 0)
      + (message?.tokens?.cache?.write || 0);

    const last = [...sessionMessages]
      .reverse()
      .find((x: Message): x is AssistantMessage => x.role === 'assistant' && resolveTotal(x) > 0);
    if (!last) return undefined;
    const total = resolveTotal(last);
    const provider = selectedModel ? providers.find((item) => item.id === selectedModel.providerID) : undefined;
    const limit = selectedModel ? provider?.models?.[selectedModel.modelID]?.limit?.context : undefined;
    return {
      total,
      input: last.tokens?.input || 0,
      output: last.tokens?.output || 0,
      reasoning: last.tokens?.reasoning || 0,
      cacheRead: last.tokens?.cache?.read || 0,
      cacheWrite: last.tokens?.cache?.write || 0,
      limit: typeof limit === 'number' ? limit : undefined,
      percentage: typeof limit === 'number' ? Math.min(100, Math.round((total / limit) * 100)) : null,
    };
  }, [sessionMessages, providers, selectedModel]);

  const tooltip = useMemo(() => {
    if (!context) return 'Context usage';
    const used = formatTokens(context.total);
    if (context.limit) return `${used} / ${formatTokens(context.limit)}`;
    return `${used} tokens`;
  }, [context]);

  const circle = (
    <div className="p-1">
      <ProgressCircle size={18} strokeWidth={2} percentage={context?.percentage ?? 0} />
    </div>
  );

  if (!activeSessionId) return null;

  if (variant === 'indicator') {
    return <div title={tooltip}>{circle}</div>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen} minWidth={200}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors',
            open && 'bg-[var(--overlay-10)] text-foreground'
          )}
          aria-label="View context usage"
          title={!open ? tooltip : undefined}
        >
          {circle}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 !bg-surface-elevated !border-border">
        <div className="px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
          Context
        </div>
        {context ? (
          <>
            <StatRow label="Tokens" value={context.limit ? `${formatTokens(context.total)} / ${formatTokens(context.limit)}` : formatTokens(context.total)} />
            {context.percentage !== null && <StatRow label="Usage" value={`${context.percentage}%`} />}
            <StatRow label="Input" value={formatTokens(context.input)} />
            <StatRow label="Output" value={formatTokens(context.output)} />
            {context.reasoning > 0 && <StatRow label="Reasoning" value={formatTokens(context.reasoning)} />}
            {(context.cacheRead > 0 || context.cacheWrite > 0) && (
              <StatRow label="Cache" value={`${formatTokens(context.cacheRead)} / ${formatTokens(context.cacheWrite)}`} />
            )}
            <div className="mx-2 my-1 border-t border-border" />
            <StatRow label="Cost" value={cost} />
          </>
        ) : (
          <div className="px-3 py-2 text-[12px] text-muted-foreground">No usage data yet</div>
        )}
      </PopoverContent>
    </Popover>
  );
}
