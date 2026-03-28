import { useState, useEffect, useCallback, useRef } from 'react';
import { registerBuiltinViews } from '@/lib/register-builtin-views';

registerBuiltinViews();
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useChatStore } from '@/stores/chatStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { FileBrowser, FileBrowserHandle } from '@/components/workspace/FileBrowser';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { QuickSwitcher } from '@/components/quick-switcher';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ToastProvider, useToast } from '@/components/chat/Toast';
import { registerToastFn, unregisterToastFn } from '@/utils/toast-bridge';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { TrashViewerPanel } from '@/components/workspace/TrashViewerPanel';
import { useFileTree } from '@/hooks/useFileTree';
import { matchShortcut, useShortcutBindings } from '@/lib/shortcuts';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useDictationStore } from '@/stores/dictationStore';
import { init as initFocusTracker, destroy as destroyFocusTracker } from '@/lib/focus-tracker';
import { useExplorerStore } from '@/stores/explorerStore';
import { useConfigSync } from '@/hooks/useConfigSync';
import { useDiffReviewBridge } from '@/hooks/useDiffReviewBridge';
import { EditorTabRow } from '@/components/editor/EditorTabRow';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import type { CoordinatorClient } from '@/lib/coordinator-client';

const APP_SHORTCUT_IDS = [
  'app.quickSwitcher.open',
  'app.note.new',
  'app.chat.newSession',
  'app.overlay.close',
  'app.focusMode.exit',
] as const;

type OverlayCloseTarget = {
  isOpen: boolean;
  close: () => void;
};

function closeTopmostOverlay(targets: readonly OverlayCloseTarget[]): boolean {
  for (const target of targets) {
    if (!target.isOpen) continue;
    target.close();
    return true;
  }
  return false;
}

const TITLEBAR_OVERLAY_COLORS = {
  dark: { color: '#262626', symbolColor: '#dadada' },
  light: { color: '#f6f6f6', symbolColor: '#222222' },
} as const;

function applyAppearanceToDOM(resolvedTheme: 'light' | 'dark', accentColor: string) {
  const html = document.documentElement;
  html.className = resolvedTheme;

  if (accentColor) {
    const parts = accentColor.match(/(\d+)\s+(\d+)%?\s+(\d+)%?/);
    if (parts) {
      html.style.setProperty('--accent-h', parts[1]);
      html.style.setProperty('--accent-s', `${parts[2]}%`);
      html.style.setProperty('--accent-l', `${parts[3]}%`);
    }
  } else {
    html.style.removeProperty('--accent-h');
    html.style.removeProperty('--accent-s');
    html.style.removeProperty('--accent-l');
  }

  window.electronAPI?.updateTitleBarTheme(TITLEBAR_OVERLAY_COLORS[resolvedTheme]);
}

function ToastBridge() {
  const { showToast } = useToast();
  useEffect(() => {
    registerToastFn(showToast);
    return () => unregisterToastFn();
  }, [showToast]);
  return null;
}

export default function Home() {
  const { metadata, openFile, setClient, currentFile, openWorkspace, recentProjects, tabs, setActiveTab, addNewTab, closeFile, removeTab, setCurrentFile, sidebarWidth } = useWorkspaceStore();
  const connectChat = useChatStore((state) => state.connect);
  const disconnectChat = useChatStore((state) => state.disconnect);
  const syncCurrentFile = useChatStore((state) => state.syncCurrentFile);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const [client, setClientLocal] = useState<CoordinatorClient | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const sidebarCollapsed = useExplorerStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useExplorerStore((s) => s.setSidebarCollapsed);
  const toggleSidebarCollapsed = useExplorerStore((s) => s.toggleSidebarCollapsed);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'none' | 'chat'>('none');
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const lastRightPanelModeRef = useRef<'chat'>('chat');
  const [showTrash, setShowTrash] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const fileBrowserRef = useRef<FileBrowserHandle>(null);
  const autoOpenAttempted = useRef(false);

  const { filePaths, fetchFileTree } = useFileTree({
    client,
    metadata,
    onFilesChanged: (affectedDirs) => {
      fileBrowserRef.current?.refreshFileList();
      fileBrowserRef.current?.refreshDirectories(affectedDirs);
    },
  });

  const { workspaceConfigLoadedRef } = useConfigSync({
    client,
    metadata,
    rightPanelMode,
    rightPanelWidth,
    onRightPanelRestore: useCallback((mode: 'none' | 'chat', width: number) => {
      setRightPanelMode(mode);
      setRightPanelWidth(width);
      if (mode !== 'none') {
        lastRightPanelModeRef.current = mode;
      }
    }, []),
  });

  useDiffReviewBridge();

  const appShortcuts = useShortcutBindings(APP_SHORTCUT_IDS);
  const closeTopmostAppOverlay = useCallback(() => {
    return closeTopmostOverlay([
      { isOpen: showWorkspaceModal && !!metadata, close: () => setShowWorkspaceModal(false) },
      { isOpen: showQuickSwitcher, close: () => setShowQuickSwitcher(false) },
      { isOpen: showSettings, close: () => setShowSettings(false) },
      { isOpen: showTrash, close: () => setShowTrash(false) },
    ]);
  }, [metadata, showQuickSwitcher, showSettings, showTrash, showWorkspaceModal]);

  useEffect(() => {
    initFocusTracker();
    return () => destroyFocusTracker();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const shared = await getSharedCoordinatorClient();
        if (!cancelled) {
          setClientLocal(shared);
          setClient(shared);
          useDictationStore.getState().setClient(shared);
        }
      } catch (err) {
        console.error('[Page] Failed to connect to coordinator:', err);
      }
    }

    connect();
    return () => {
      cancelled = true;
    };
  }, [setClient]);

  useEffect(() => {
    const directory = metadata?.projectPath;
    if (!directory) {
      disconnectChat();
      return;
    }

    connectChat(directory).catch((err) => {
      console.error('[Page] Failed to connect to OpenCode:', err);
    });

    return () => {
      disconnectChat();
    };
  }, [metadata?.projectPath, connectChat, disconnectChat]);

  useEffect(() => {
    const { resolvedTheme, accentColor } = useAppearanceStore.getState();
    applyAppearanceToDOM(resolvedTheme, accentColor);

    const unsub = useAppearanceStore.subscribe(
      (state) => ({ resolvedTheme: state.resolvedTheme, accentColor: state.accentColor }),
      ({ resolvedTheme, accentColor }) => applyAppearanceToDOM(resolvedTheme, accentColor),
    );

    return unsub;
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const { theme } = useAppearanceStore.getState();
      if (theme === 'system') {
        useAppearanceStore.getState().setTheme('system');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    syncCurrentFile(currentFile);
  }, [currentFile, syncCurrentFile]);

  useEffect(() => {
    if (!client || metadata || autoOpenAttempted.current) {
      return;
    }

    autoOpenAttempted.current = true;

    if (recentProjects.length === 0) {
      setShowWorkspaceModal(true);
      return;
    }

    const [mostRecent] = recentProjects;

    openWorkspace(mostRecent.projectPath)
      .then(() => {
        const hasWorkspace = !!useWorkspaceStore.getState().metadata;
        setShowWorkspaceModal(!hasWorkspace);
      })
      .catch(() => {
        setShowWorkspaceModal(true);
      });
  }, [client, metadata, openWorkspace, recentProjects]);

  useEffect(() => {
    if (metadata) {
      setShowWorkspaceModal(false);
    }
  }, [metadata]);

  const handleNewNote = useCallback(async () => {
    if (!client) return;

    try {
      let name = 'Untitled.md';
      let counter = 1;
      const existing = new Set(filePaths.filter(p => !p.includes('/')));
      while (existing.has(name)) {
        name = `Untitled ${counter}.md`;
        counter++;
      }
      await client.saveFile(name, '');
      fileBrowserRef.current?.refreshFileList();
      fetchFileTree();
      openFile(name, '', true);
    } catch (err) {
      console.error('[Page] Failed to create new note:', err);
    }
  }, [client, openFile, fetchFileTree, filePaths]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (matchShortcut(e, appShortcuts['app.overlay.close'])) {
        const closedOverlay = closeTopmostAppOverlay();
        if (closedOverlay) {
          e.preventDefault();
          return;
        }
      }
      if (focusModeEnabled && matchShortcut(e, appShortcuts['app.focusMode.exit'])) {
        e.preventDefault();
        setFocusModeEnabled(false);
        return;
      }
      if (matchShortcut(e, appShortcuts['app.quickSwitcher.open'])) {
        e.preventDefault();
        setShowQuickSwitcher(true);
        return;
      }
      if (matchShortcut(e, appShortcuts['app.note.new'])) {
        e.preventDefault();
        handleNewNote();
        return;
      }
      if (matchShortcut(e, appShortcuts['app.chat.newSession'])) {
        e.preventDefault();
        setRightPanelMode('chat');
        setActiveSession(null).catch(() => undefined);
        return;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [appShortcuts, closeTopmostAppOverlay, focusModeEnabled, setActiveSession, handleNewNote]);

  useEffect(() => {
    if (rightPanelMode !== 'none') {
      lastRightPanelModeRef.current = rightPanelMode;
    }
  }, [rightPanelMode]);

  const handleFileOpen = useCallback(
    (filePath: string, content: string, forceNewTab?: boolean) => {
      openFile(filePath, content, forceNewTab);
    },
    [openFile]
  );

  const handleOpenWorkspace = useCallback(() => {
    setShowWorkspaceModal(true);
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelMode((mode) => (mode === 'none' ? lastRightPanelModeRef.current : 'none'));
  }, []);

  const handleAddSelectionToChat = useCallback((data: { path: string; selection: { startLine: number; startChar: number; endLine: number; endChar: number }; preview: string }) => {
    const { promptParts, setPromptParts } = useChatStore.getState();
    const startLine = Math.min(data.selection.startLine, data.selection.endLine);
    const endLine = Math.max(data.selection.startLine, data.selection.endLine);
    const filename = data.path.split(/[/\\]/).pop() || data.path;
    const content = startLine === endLine ? `${filename}:${startLine}` : `${filename}:${startLine}-${endLine}`;
    const lastPart = promptParts[promptParts.length - 1];
    const position = lastPart ? lastPart.end : 0;
    const newPart = {
      type: 'file' as const,
      content,
      path: data.path,
      selection: { startLine, endLine },
      start: position,
      end: position + content.length,
    };
    const newParts = [...promptParts, newPart, { type: 'text' as const, content: ' ', start: newPart.end, end: newPart.end + 1 }];
    setPromptParts(newParts);
    setRightPanelMode('chat');
  }, []);


  const toggleFocusMode = useCallback(() => {
    setFocusModeEnabled((prev) => !prev);
  }, []);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tab.filePath === '__new_tab__') {
        removeTab(tabId);
      } else {
        closeFile(tab.filePath);
      }
      const remaining = useWorkspaceStore.getState().tabs;
      if (remaining.length > 0) {
        const active = remaining.find((t) => t.isActive) || remaining[0];
        setCurrentFile(active.filePath);
      } else {
        setCurrentFile(null);
      }
    },
    [tabs, closeFile, removeTab, setCurrentFile]
  );

  const handleCloseOthers = useCallback(
    (tabId: string) => {
      tabs.forEach((t) => {
        if (t.id !== tabId) handleCloseTab(t.id);
      });
    },
    [tabs, handleCloseTab]
  );

  const handleCloseToRight = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      if (idx === -1) return;
      tabs.slice(idx + 1).forEach((t) => handleCloseTab(t.id));
    },
    [tabs, handleCloseTab]
  );

  const handleCloseAll = useCallback(() => {
    tabs.forEach((t) => handleCloseTab(t.id));
  }, [tabs, handleCloseTab]);

  const isSidebarHidden = sidebarCollapsed || focusModeEnabled;

  useEffect(() => {
    if (!focusModeEnabled) return;
    setShowQuickSwitcher(false);
    setShowWorkspaceModal(false);
    setShowSettings(false);
    setShowTrash(false);
  }, [focusModeEnabled]);

  const rightPanelMin = 280;
  const rightPanelMax = Math.max(rightPanelMin, Math.floor(window.innerWidth * 0.45));
  const resolvedRightPanelWidth = Math.min(rightPanelMax, Math.max(rightPanelMin, rightPanelWidth));
  const isRightPanelHidden = focusModeEnabled || rightPanelMode === 'none';

  useEffect(() => {
    if (resolvedRightPanelWidth === rightPanelWidth) return;
    setRightPanelWidth(resolvedRightPanelWidth);
  }, [rightPanelWidth, resolvedRightPanelWidth]);

  const handleFileRenamed = useCallback(() => {
    fileBrowserRef.current?.refreshFileList();
    fetchFileTree();
  }, [fetchFileTree]);

  const handleNavigateToFile = useCallback(async (filePath: string) => {
    if (!client) return;

    try {
      if (BINARY_FILE_EXTENSIONS.test(filePath)) {
        openFile(filePath, '');
        return;
      }
      if (useWorkspaceStore.getState().openFiles.has(filePath)) {
        openFile(filePath, '');
        return;
      }
      const { content } = await client.readFile(filePath);
      openFile(filePath, content);
    } catch (err) {
      console.error('[Page] Failed to navigate to file:', err);
    }
  }, [client, openFile]);

  const handleCreateFile = useCallback(async (fileName: string) => {
    if (!client) return;

    try {
      const filePath = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
      await client.saveFile(filePath, '');
      fileBrowserRef.current?.refreshFileList();
      fetchFileTree();
      openFile(filePath, '', true);
    } catch (err) {
      console.error('[Page] Failed to create file:', err);
    }
  }, [client, openFile, fetchFileTree]);

  useEffect(() => {
    if (!window.electronAPI?.onOpenWorkspace) return;
    window.electronAPI.onOpenWorkspace((path) => {
      openWorkspace(path).catch((err) => {
        console.error('[Home] Failed to open workspace from OS:', err);
      });
    });
  }, [openWorkspace]);

  if (!client) {
    return (
      <div className="h-screen w-screen bg-background">
        <LogoSpinner />
      </div>
    );
  }

  return (
    <ToastProvider>
      <ToastBridge />
      <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      {!focusModeEnabled && (
        <EditorTabRow
          sidebarOpen={!isSidebarHidden && !!metadata}
          sidebarWidth={sidebarWidth}
          onOpenWorkspace={handleOpenWorkspace}
          onToggleSidebar={() => {
            if (focusModeEnabled) {
              setFocusModeEnabled(false);
            }
            toggleSidebarCollapsed();
          }}
          tabs={tabs}
          onSelectTab={setActiveTab}
          onCloseTab={handleCloseTab}
          onCloseOthers={handleCloseOthers}
          onCloseToRight={handleCloseToRight}
          onCloseAll={handleCloseAll}
          onAddTab={addNewTab}
          rightPanelOpen={rightPanelMode !== 'none'}
          rightPanelWidth={resolvedRightPanelWidth}
          onToggleRightPanel={toggleRightPanel}
        />
      )}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <FileBrowser
          ref={fileBrowserRef}
          client={client}
          onFileOpen={handleFileOpen}
          onSidebarToggle={setSidebarCollapsed}
          isCollapsed={isSidebarHidden}
          onSearch={() => setShowQuickSwitcher(true)}
          onSettings={() => {
            setShowSettings(true);
          }}
          onTrash={() => setShowTrash(true)}
        />

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
              <EditorPanel
                client={client}
                onFileRenamed={handleFileRenamed}
                filePaths={filePaths}
                focusModeEnabled={focusModeEnabled}
                onToggleFocusMode={toggleFocusMode}
                onNewNote={handleNewNote}
                onGoToFile={() => setShowQuickSwitcher(true)}
                onAddSelectionToChat={handleAddSelectionToChat}
              />
          </div>

        </main>

        <aside
          className="relative h-full flex-shrink-0 border-l border-border bg-sidebar-bg transition-[margin] duration-300 ease-in-out"
          style={{
            width: resolvedRightPanelWidth,
            marginRight: isRightPanelHidden ? -resolvedRightPanelWidth : 0,
          }}
        >
          {!focusModeEnabled && rightPanelMode !== 'none' && (
            <ResizeHandle
              direction="horizontal"
              edge="start"
              size={resolvedRightPanelWidth}
              min={rightPanelMin}
              max={rightPanelMax}
              collapseThreshold={Math.max(0, rightPanelMin - 40)}
              onResize={setRightPanelWidth}
              onCollapse={() => setRightPanelMode('none')}
            />
          )}
          {rightPanelMode === 'chat' && (
            <ChatSidebar />
          )}
        </aside>

      {!focusModeEnabled && showTrash && (
        <ModalOverlay onBackdropClick={() => setShowTrash(false)}>
          <TrashViewerPanel
            client={client}
            onClose={() => setShowTrash(false)}
            onFileRestored={() => {
              fileBrowserRef.current?.refreshFileList();
              fetchFileTree();
            }}
          />
        </ModalOverlay>
      )}

      {!focusModeEnabled && showSettings && (
        <ModalOverlay maxWidth="5xl" onBackdropClick={() => setShowSettings(false)}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </ModalOverlay>
      )}

      <WorkspaceModal
        isOpen={showWorkspaceModal && !focusModeEnabled}
        onClose={() => setShowWorkspaceModal(false)}
      />

      <QuickSwitcher
        isOpen={showQuickSwitcher && !focusModeEnabled}
        onClose={() => setShowQuickSwitcher(false)}
        filePaths={filePaths}
        onSelectFile={handleNavigateToFile}
        onCreateFile={handleCreateFile}
      />
    </div>
    </div>
    </ToastProvider>
  );
}
