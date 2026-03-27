
import type { TabState } from '@cushion/types';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallback, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { noDragStyle } from './editor-path';

interface EditorTabsProps {
  tabs: TabState[];
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseAll?: () => void;
  onAddTab?: () => void;
}

function getFileName(filePath: string): string {
  if (filePath === '__new_tab__') return 'New tab';
  const name = filePath.split('/').pop() || filePath;
  return name.endsWith('.md') ? name.slice(0, -3) : name;
}

export function EditorTabs({ tabs, onSelectTab, onCloseTab, onCloseOthers, onCloseToRight, onCloseAll, onAddTab }: EditorTabsProps) {
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const convertPreviewTab = useWorkspaceStore((s) => s.convertPreviewTab);
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);

  const handleDoubleClick = useCallback((tab: TabState) => {
    if (tab.isPreview) {
      convertPreviewTab(tab.filePath);
    }
  }, [convertPreviewTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ tabId, x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div className="flex h-10 items-end px-2 min-w-0">
      {tabs.map((tab, index) => {
        const isActive = tab.isActive;
        const previousTab = index > 0 ? tabs[index - 1] : null;
        const previousIsActive = previousTab?.isActive ?? false;
        const showInactiveSeparator = !isActive && index > 0 && !previousIsActive;
        const file = openFiles.get(tab.filePath);
        const isDirty = file?.isDirty ?? false;

        return (
          <div
            key={tab.id}
            className={cn(
              "group relative flex items-center gap-1.5 h-9 px-3 border text-xs cursor-pointer select-none basis-[150px] min-w-0 max-w-[480px] shrink",
              "transition-colors duration-150",
              isActive
                ? "z-10 rounded-t-lg rounded-b-none bg-tab-active text-tab-text-active border-border border-b-background"
                : "rounded-none border-transparent text-tab-text hover:text-tab-text-active after:absolute after:inset-x-1 after:inset-y-1 after:rounded-lg after:transition-colors after:duration-150 hover:after:bg-[var(--background-modifier-hover)]",
              showInactiveSeparator && "before:absolute before:left-0 before:top-2 before:h-4 before:w-px before:bg-border"
            )}
            style={noDragStyle}
            title={getFileName(tab.filePath)}
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
          >
            <span className={cn("truncate min-w-0 flex-1", tab.isPreview && "italic")}>
              {getFileName(tab.filePath)}
            </span>
            {isDirty && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            )}
            <button
              className={cn(
                "ml-auto w-4 h-4 flex items-center justify-center rounded shrink-0",
                "transition-opacity duration-150",
                "hover:bg-[var(--background-modifier-hover)]",
                isActive ? "opacity-60 hover:opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}

      {onAddTab && (
        <button
          onClick={onAddTab}
          className={cn(
            "h-7 w-7 rounded-sm flex items-center justify-center shrink-0 ml-1 self-center",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-[var(--background-modifier-hover)]",
            "transition-colors duration-150"
          )}
          style={noDragStyle}
          title="New tab"
        >
          <Plus size={16} />
        </button>
      )}

      <DropdownMenu
        open={!!contextMenu}
        onOpenChange={(open) => { if (!open) setContextMenu(null); }}
      >
        <DropdownMenuTrigger
          style={{
            position: 'fixed',
            left: contextMenu?.x ?? 0,
            top: contextMenu?.y ?? 0,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
        <DropdownMenuContent align="start" side="bottom" sideOffset={0}>
          <DropdownMenuItem onClick={() => {
            if (contextMenu) onCloseTab(contextMenu.tabId);
          }}>
            Close
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            if (contextMenu) onCloseOthers?.(contextMenu.tabId);
          }}>
            Close others
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            if (contextMenu) onCloseToRight?.(contextMenu.tabId);
          }}>
            Close to the right
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => {
            onCloseAll?.();
          }}>
            Close all
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
