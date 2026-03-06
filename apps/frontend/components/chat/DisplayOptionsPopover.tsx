'use client';

import { useState } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-[var(--overlay-10)] transition-colors"
      onClick={() => onChange(!checked)}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <div className="text-[12px] text-muted-foreground">{description}</div>
      </div>
      <div
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
          checked ? 'bg-accent-blue' : 'bg-[var(--overlay-20)]'
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          )}
        />
      </div>
    </button>
  );
}

export function DisplayOptionsPopover() {
  const [open, setOpen] = useState(false);
  const showThinking = useChatStore((s) => s.displayPreferences.showThinking);
  const shellExpanded = useChatStore((s) => s.displayPreferences.shellToolPartsExpanded);
  const editExpanded = useChatStore((s) => s.displayPreferences.editToolPartsExpanded);
  const toggleShowThinking = useChatStore((s) => s.toggleShowThinking);
  const toggleShellExpanded = useChatStore((s) => s.toggleShellToolPartsExpanded);
  const toggleEditExpanded = useChatStore((s) => s.toggleEditToolPartsExpanded);

  return (
    <Popover open={open} onOpenChange={setOpen} minWidth={240}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors',
            open && 'bg-[var(--overlay-10)] text-foreground'
          )}
          aria-label="Display options"
          title="Display options"
        >
          <Icon name="sliders" size="small" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 !bg-surface-elevated !border-border">
        <div className="px-2 py-1.5 text-[12px] font-medium text-muted-foreground">
          Display
        </div>
        <ToggleRow
          label="Show thinking"
          description="Display reasoning in the timeline"
          checked={showThinking}
          onChange={toggleShowThinking}
        />
        <ToggleRow
          label="Shell output expanded"
          description="Auto-expand shell/bash tool output"
          checked={shellExpanded}
          onChange={toggleShellExpanded}
        />
        <ToggleRow
          label="Edit output expanded"
          description="Auto-expand edit/write tool output"
          checked={editExpanded}
          onChange={toggleEditExpanded}
        />
      </PopoverContent>
    </Popover>
  );
}
