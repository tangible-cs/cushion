
import type { TabState } from '@cushion/types';
import { PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EditorTabs } from './EditorTabs';

interface EditorTabRowProps {
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  onToggleSidebar?: () => void;
  onOpenWorkspace?: () => void;
  tabs: TabState[];
  currentFile: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCloseOthers?: (tabId: string) => void;
  onCloseToRight?: (tabId: string) => void;
  onCloseAll?: () => void;
  onAddTab?: () => void;
  rightPanelOpen?: boolean;
  rightPanelWidth?: number;
  onToggleRightPanel?: () => void;
}

const isElectron = !!window.electronAPI;
const noDragStyle = isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined;

export function EditorTabRow({
  sidebarOpen,
  sidebarWidth,
  onToggleSidebar,
  onOpenWorkspace,
  tabs,
  currentFile,
  onSelectTab,
  onCloseTab,
  onCloseOthers,
  onCloseToRight,
  onCloseAll,
  onAddTab,
  rightPanelOpen,
  rightPanelWidth,
  onToggleRightPanel,
}: EditorTabRowProps) {
  return (
    <div
      className={cn(
        'relative flex items-center bg-tab-container min-h-[40px] flex-shrink-0',
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']",
        isElectron && 'select-none'
      )}
      style={isElectron ? {
        WebkitAppRegion: 'drag',
        paddingRight: rightPanelOpen ? undefined : 140,
      } as React.CSSProperties : undefined}
    >
      <div
        className={cn(
          'flex items-center self-center flex-shrink-0',
          sidebarOpen && 'border-r border-border'
        )}
        style={{ width: sidebarOpen ? sidebarWidth : undefined }}
      >
        {onOpenWorkspace && (
          <button
            onClick={onOpenWorkspace}
            className={cn(
              'ml-2 h-8 w-8 rounded-md flex-shrink-0 flex items-center justify-center overflow-visible',
              'hover:bg-muted/30',
              'transition-colors duration-150'
            )}
            style={noDragStyle}
            title="Open workspace"
            aria-label="Open workspace"
          >
            <img src="/logo.svg" alt="Cushion" className="h-7 w-7" />
          </button>
        )}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={cn(
              'ml-1 mr-auto h-7 w-7 rounded-md flex-shrink-0 flex items-center justify-center',
              sidebarOpen ? 'text-foreground' : 'text-muted-foreground',
              'hover:text-foreground',
              'hover:bg-muted/30',
              'transition-colors duration-150'
            )}
            style={noDragStyle}
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-pressed={!!sidebarOpen}
          >
            <PanelLeft size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div
        className="min-w-0 flex-1 flex items-center"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          {tabs.length > 0 ? (
            <EditorTabs
              tabs={tabs}
              currentFile={currentFile}
              onSelectTab={onSelectTab}
              onCloseTab={onCloseTab}
              onCloseOthers={onCloseOthers}
              onCloseToRight={onCloseToRight}
              onCloseAll={onCloseAll}
              onAddTab={onAddTab}
            />
          ) : (
            <div className="h-10" />
          )}
        </div>

        {onToggleRightPanel && (
          <button
            onClick={onToggleRightPanel}
            className={cn(
              'mx-2 h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md',
              rightPanelOpen ? 'text-foreground' : 'text-muted-foreground',
              'hover:text-foreground',
              'hover:bg-muted/30',
              'transition-colors duration-150'
            )}
            style={noDragStyle}
            title={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
            aria-label={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
            aria-pressed={!!rightPanelOpen}
          >
            <PanelRight size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {rightPanelOpen && (
        <div
          className="flex-shrink-0 self-stretch border-l border-border"
          style={{ width: rightPanelWidth }}
        />
      )}
    </div>
  );
}
