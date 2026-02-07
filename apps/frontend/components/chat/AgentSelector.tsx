'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Icon } from './Icon';

type AgentSelectorProps = {
  disabled?: boolean;
  compactLevel?: number;
};

const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
const COMPACT_SIZE_CLASSES = [
  'gap-1.5 px-2.5 max-w-[160px]',
  'gap-1.5 px-2.5 max-w-[16ch]',
  'gap-1 px-2 max-w-[12ch]',
  'gap-1 px-2 max-w-[7ch]',
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

export function AgentSelector({ disabled = false, compactLevel }: AgentSelectorProps) {
  const agents = useChatStore((state) => state.agents);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);
  const [searchQuery, setSearchQuery] = useState('');
  const resolvedLevel = resolveCompactLevel(compactLevel);

  const visibleAgents = useMemo(() => agents.filter((agent) => !agent.hidden), [agents]);
  const filteredAgents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return visibleAgents;
    return visibleAgents.filter((agent) => {
      const name = agent.name.toLowerCase();
      const description = agent.description?.toLowerCase() ?? '';
      return name.includes(query) || description.includes(query);
    });
  }, [visibleAgents, searchQuery]);
  const showEmpty = filteredAgents.length === 0 && (visibleAgents.length === 0 || searchQuery.trim().length > 0);

  const displayLabel = selectedAgent ?? 'Default agent';
  const maxLength = COMPACT_LABEL_LENGTHS[resolvedLevel];
  const compactLabel = resolvedLevel === 0 ? displayLabel : getCompactLabel(displayLabel, maxLength);
  const sizeClass = COMPACT_SIZE_CLASSES[resolvedLevel];
  const showIcon = resolvedLevel <= 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={displayLabel}
          className={`h-7 min-w-0 rounded-md border border-transparent bg-transparent text-sm text-muted-foreground hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors ${sizeClass}`.trim()}
          aria-label={displayLabel}
        >
          {showIcon && <Icon name="brain" size="small" className="text-muted-foreground shrink-0" />}
          <span className="text-foreground truncate min-w-0">
            {compactLabel}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 flex flex-col">
        <div className="p-2 border-b border-border">
          <input
            type="text"
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--md-accent)]"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto max-h-56 thin-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedAgent(null)}
            className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors ${
              !selectedAgent ? 'bg-muted/40 text-foreground' : 'text-muted-foreground'
            }`.trim()}
          >
            <div className="flex items-center gap-2">
              <div className="truncate flex-1">Default agent</div>
            </div>
          </button>
          {filteredAgents.map((agent) => {
            const isSelected = selectedAgent === agent.name;
            return (
              <button
                key={agent.name}
                type="button"
                onClick={() => setSelectedAgent(agent.name)}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors ${
                  isSelected ? 'bg-muted/40 text-foreground' : 'text-muted-foreground'
                }`.trim()}
                title={agent.name}
              >
                <div className="flex items-center gap-2">
                  <div className="truncate flex-1">{agent.name}</div>
                </div>
                {agent.description && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                    {agent.description}
                  </div>
                )}
              </button>
            );
          })}
          {showEmpty && (
            <div className="px-3 py-8 text-xs text-muted-foreground text-center">No agents found</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
