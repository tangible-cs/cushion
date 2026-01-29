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
    <div className="flex h-10 items-center gap-1 px-2 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.filePath === currentFile;
        const file = openFiles.get(tab.filePath);
        const isDirty = file?.isDirty ?? false;

        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1.5 h-7 px-3 rounded text-sm cursor-pointer select-none shrink-0",
              "transition-colors duration-150",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
            onClick={() => onSelectTab(tab.filePath)}
          >
            <span className={cn("truncate max-w-[120px]", tab.isPreview && "italic")}>
              {getFileName(tab.filePath)}
            </span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
            {/* Close button - visible on hover or when active */}
            <button
              className={cn(
                "w-4 h-4 flex items-center justify-center rounded",
                "transition-opacity duration-150",
                "hover:bg-black/10 dark:hover:bg-white/10",
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

      {/* Add tab button */}
      {onAddTab && (
        <button
          onClick={onAddTab}
          className={cn(
            "h-7 w-7 rounded flex items-center justify-center shrink-0",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-muted/50",
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
