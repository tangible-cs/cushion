'use client';

import type { TabState } from '@cushion/types';
import { PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorTabs } from './EditorTabs';

interface EditorTabRowProps {
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  tabs: TabState[];
  currentFile: string | null;
  onSelectTab: (filePath: string) => void;
  onCloseTab: (filePath: string) => void;
  rightPanelOpen?: boolean;
  onToggleRightPanel?: () => void;
}

export function EditorTabRow({
  sidebarCollapsed,
  onExpandSidebar,
  tabs,
  currentFile,
  onSelectTab,
  onCloseTab,
  rightPanelOpen,
  onToggleRightPanel,
}: EditorTabRowProps) {
  return (
    <div className="relative flex items-end bg-tab-container min-h-[40px] flex-shrink-0 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']">
      {sidebarCollapsed && (
        <button
          onClick={onExpandSidebar}
          className={cn(
            'ml-2 h-8 w-8 rounded flex-shrink-0 flex items-center justify-center',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/40',
            'transition-colors duration-150'
          )}
          title="Open sidebar"
        >
          <PanelLeft size={16} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {tabs.length > 0 ? (
          <EditorTabs
            tabs={tabs}
            currentFile={currentFile}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
          />
        ) : (
          <div className="h-10" />
        )}
      </div>

      {onToggleRightPanel && (
        <div className="mr-2 flex items-center gap-1">
          <button
            onClick={onToggleRightPanel}
            className={cn(
              'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded',
              rightPanelOpen ? 'text-foreground' : 'text-muted-foreground',
              'hover:text-foreground',
              'hover:bg-muted/40',
              'transition-colors duration-150'
            )}
            title={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
            aria-label={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
            aria-pressed={!!rightPanelOpen}
          >
            <PanelRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
