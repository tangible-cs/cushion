'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { cn } from '@/lib/utils';

type AgentSelectorProps = {
  disabled?: boolean;
  compactLevel?: number;
};

const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
const COMPACT_SIZE_CLASSES = [
  'gap-1.5 pl-2 pr-1 max-w-[160px]',
  'gap-1.5 pl-2 pr-1 max-w-[16ch]',
  'gap-1 pl-2 pr-1 max-w-[12ch]',
  'gap-1 pl-2 pr-1 max-w-[7ch]',
] as const;

function resolveCompactLevel(level?: number): number {
  const maxLevel = COMPACT_LABEL_LENGTHS.length - 1;
  if (typeof level !== 'number' || Number.isNaN(level)) return 0;
  return Math.min(Math.max(level, 0), maxLevel);
}

function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function formatAgentLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return label;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function AgentSelector({ disabled = false, compactLevel }: AgentSelectorProps) {
  const agents = useChatStore((state) => state.agents);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);
  const [isOpen, setIsOpen] = useState(false);
  const resolvedLevel = resolveCompactLevel(compactLevel);

  const visibleAgents = useMemo(() => agents.filter((agent) => !agent.hidden), [agents]);
  const showEmpty = visibleAgents.length === 0;

  const displayLabel = formatAgentLabel(selectedAgent ?? 'Default agent');
  const maxLength = COMPACT_LABEL_LENGTHS[resolvedLevel];
  const compactLabel = resolvedLevel === 0 ? displayLabel : getCompactLabel(displayLabel, maxLength);
  const sizeClass = COMPACT_SIZE_CLASSES[resolvedLevel];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} minWidth={160}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={displayLabel}
          className={cn(
            'h-7 min-w-0 rounded-md border border-transparent bg-transparent text-[14px] font-normal text-muted-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 flex items-center transition-colors',
            isOpen && 'bg-[var(--overlay-10)]',
            sizeClass
          )}
          aria-label={displayLabel}
        >
          <span className="text-foreground truncate min-w-0 text-[14px] font-normal">{compactLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 !bg-surface-elevated !border-border">
        <div className="max-h-48 overflow-y-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedAgent(null)}
            className="w-full rounded-md px-2 py-1.5 text-left text-[14px] font-normal text-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="truncate flex-1">Default agent</div>
              {!selectedAgent && <Check className="size-3.5 text-foreground shrink-0" />}
            </div>
          </button>
          {visibleAgents.map((agent) => {
            const isSelected = selectedAgent === agent.name;
            const agentLabel = formatAgentLabel(agent.name);
            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => setSelectedAgent(agent.name)}
                className="w-full rounded-md px-2 py-1.5 text-left text-[14px] font-normal text-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none transition-colors"
                title={agentLabel}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate flex-1">{agentLabel}</div>
                  {isSelected && <Check className="size-3.5 text-foreground shrink-0" />}
                </div>
              </button>
            );
          })}
          {showEmpty && (
            <div className="px-3 py-8 text-sm text-muted-foreground text-center">No agents available</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
