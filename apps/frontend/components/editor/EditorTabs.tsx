'use client';

import type { TabState } from '@cushion/types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorTabsProps {
  tabs: TabState[];
  currentFile: string | null;
  onSelectTab: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  onAddTab?: () => void;
}

function getFileName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  return name.endsWith('.md') ? name.slice(0, -3) : name;
}

export function EditorTabs({ tabs, currentFile, onSelectTab, onCloseTab, onAddTab }: EditorTabsProps) {
  const openFiles = useWorkspaceStore((s) => s.openFiles);

  return (
    <div className="flex h-10 items-end px-2 overflow-x-auto overflow-y-hidden thin-scrollbar">
      {tabs.map((tab, index) => {
        const isActive = tab.filePath === currentFile;
        const previousTab = index > 0 ? tabs[index - 1] : null;
        const previousIsActive = previousTab?.filePath === currentFile;
        const showInactiveSeparator = !isActive && index > 0 && !previousIsActive;
        const file = openFiles.get(tab.filePath);
        const isDirty = file?.isDirty ?? false;

        return (
          <div
            key={tab.id}
            className={cn(
              "group relative flex shrink-0 items-center gap-1.5 h-8 px-3 border text-sm cursor-pointer select-none min-w-[72px] max-w-[220px]",
              "transition-colors duration-150",
              isActive
                ? "z-10 rounded-t-sm rounded-b-none bg-tab-active text-tab-text-active border-border border-b-background"
                : "rounded-none border-transparent text-tab-text hover:bg-[var(--background-modifier-hover)] hover:text-tab-text-active",
              showInactiveSeparator && "before:absolute before:left-0 before:top-2 before:h-4 before:w-px before:bg-border"
            )}
            title={getFileName(tab.filePath)}
            onClick={() => onSelectTab(tab.filePath)}
          >
            <span className={cn("truncate min-w-0", tab.isPreview && "italic")}>
              {getFileName(tab.filePath)}
            </span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            )}
            <button
              className={cn(
                "w-4 h-4 flex items-center justify-center rounded",
                "transition-opacity duration-150",
                "hover:bg-[var(--background-modifier-hover)]",
                isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.filePath);
              }}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {onAddTab && (
        <button
          onClick={onAddTab}
          className={cn(
            "h-8 w-8 rounded flex items-center justify-center shrink-0 ml-1",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-[var(--background-modifier-hover)]",
            "transition-colors duration-150"
          )}
          title="New tab"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}
