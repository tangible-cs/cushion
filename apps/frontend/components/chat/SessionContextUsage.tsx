
import { useMemo } from 'react';
import { ProgressCircle } from './ProgressCircle';
import { useChatStore } from '@/stores/chatStore';
import type { Message, AssistantMessage } from '@opencode-ai/sdk/v2/client';

type SessionContextUsageProps = {
  variant?: 'button' | 'indicator';
};

export function SessionContextUsage({ variant = 'button' }: SessionContextUsageProps) {
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const messages = useChatStore((state) => state.messages);
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const sessionMessages = activeSessionId ? messages[activeSessionId] || [] : [];

  const usd = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }),
    [],
  );

  const cost = useMemo(() => {
    const total = sessionMessages.reduce((sum: number, x: Message) => sum + (x.role === 'assistant' ? (x.cost || 0) : 0), 0);
    return usd.format(total);
  }, [sessionMessages, usd]);

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
      tokens: total.toLocaleString(),
      percentage: typeof limit === 'number' ? Math.min(100, Math.round((total / limit) * 100)) : null,
    };
  }, [sessionMessages, providers, selectedModel]);

  const circle = () => (
    <div className="p-1">
      <ProgressCircle size={16} strokeWidth={2} percentage={context?.percentage ?? 0} />
    </div>
  );

  if (!activeSessionId) return null;

  return (
    <div className="group relative">
      <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-foreground text-surface text-xs rounded whitespace-nowrap z-50">
        {context && (
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{context.tokens}</span>
              <span>tokens</span>
            </div>
            {context.percentage !== null && (
              <div className="flex items-center gap-2">
                <span className="font-semibold">{context.percentage}%</span>
                <span>usage</span>
              </div>
            )}
          </>
        )}
        <div className="flex items-center gap-2">
          <span className="font-semibold">{cost}</span>
          <span>cost</span>
        </div>
      </div>
      {variant === 'indicator' ? (
        circle()
      ) : (
        <button
          type="button"
          className="size-6 flex items-center justify-center rounded-md hover:bg-muted/40 transition-colors"
          aria-label="View context usage"
        >
          {circle()}
        </button>
      )}
    </div>
  );
}
