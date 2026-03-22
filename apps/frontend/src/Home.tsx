import { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, GitBranch } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useChatStore } from '@/stores/chatStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { FileBrowser, FileBrowserHandle } from '@/components/workspace/FileBrowser';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { EditorPanel } from '@/components/editor/EditorPanel';
import { BacklinksPanel } from '@/components/editor/BacklinksPanel';
import { GraphView } from '@/components/graph/GraphView';
import { QuickSwitcher } from '@/components/quick-switcher';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ToastProvider } from '@/components/chat/Toast';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useLinkIndex } from '@/hooks/useLinkIndex';
import { useFileTree } from '@/hooks/useFileTree';
import { formatShortcutList, matchShortcut, useShortcutBindings } from '@/lib/shortcuts';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useConfigSync } from '@/hooks/useConfigSync';
import { useDiffReviewBridge } from '@/hooks/useDiffReviewBridge';
import { EditorTabRow } from '@/components/editor/EditorTabRow';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import type { CoordinatorClient } from '@/lib/coordinator-client';

const APP_SHORTCUT_IDS = [
  'app.quickSwitcher.open',
  'app.note.new',
  'app.chat.newSession',
  'app.graph.toggle',
  'app.backlinks.toggle',
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
    // accentColor is stored as "h s% l%" (e.g. "210 90% 50%")
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

export default function Home() {
  const { metadata, openFile, setClient, currentFile, openWorkspace, recentProjects, tabs, setActiveTab, addNewTab, closeFile, setCurrentFile, sidebarWidth } = useWorkspaceStore();
  const openFiles = useWorkspaceStore((state) => state.openFiles);
  const connectChat = useChatStore((state) => state.connect);
  const disconnectChat = useChatStore((state) => state.disconnect);
  const syncCurrentFile = useChatStore((state) => state.syncCurrentFile);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const [client, setClientLocal] = useState<CoordinatorClient | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusModeEnabled, setFocusModeEnabled] = useState(false);
  const [rightPanelMode, setRightPanelMode] = useState<'none' | 'chat'>('none');
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const lastRightPanelModeRef = useRef<'chat'>('chat');
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false);
  const fileBrowserRef = useRef<FileBrowserHandle>(null);
  const autoOpenAttempted = useRef(false);

  // File tree and connection state from useFileTree hook
  const { fileTree, connectionState, fetchFileTree } = useFileTree({
    client,
    metadata,
    onFilesChanged: () => fileBrowserRef.current?.refreshFileList(),
  });

  // Link index from useLinkIndex hook
  const linkIndex = useLinkIndex({
    client,
    metadata,
    fileTree,
    openFiles,
  });

  // Config sync lifecycle (settings, workspace, appearance, chat)
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

  // Bridge: chat diffs → inline editor review
  useDiffReviewBridge();

  const appShortcuts = useShortcutBindings(APP_SHORTCUT_IDS);
  const closeTopmostAppOverlay = useCallback(() => {
    return closeTopmostOverlay([
      { isOpen: showWorkspaceModal && !!metadata, close: () => setShowWorkspaceModal(false) },
      { isOpen: showQuickSwitcher, close: () => setShowQuickSwitcher(false) },
      { isOpen: showSettings, close: () => setShowSettings(false) },
      { isOpen: showGraph, close: () => setShowGraph(false) },
      { isOpen: showBacklinks, close: () => setShowBacklinks(false) },
    ]);
  }, [metadata, showBacklinks, showGraph, showQuickSwitcher, showSettings, showWorkspaceModal]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      try {
        const shared = await getSharedCoordinatorClient();
        if (!cancelled) {
          setClientLocal(shared);
          setClient(shared);
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

  // Apply theme class and accent color CSS variables to <html>
  useEffect(() => {
    const { resolvedTheme, accentColor } = useAppearanceStore.getState();
    applyAppearanceToDOM(resolvedTheme, accentColor);

    const unsub = useAppearanceStore.subscribe(
      (state) => ({ resolvedTheme: state.resolvedTheme, accentColor: state.accentColor }),
      ({ resolvedTheme, accentColor }) => applyAppearanceToDOM(resolvedTheme, accentColor),
    );

    return unsub;
  }, []);

  // Listen for OS theme changes when theme === 'system'
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

  // Sync active file → chat store so @current-file badge updates
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
      const existing = new Set(fileTree?.map((n) => n.name) ?? []);
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
  }, [client, openFile, fetchFileTree, fileTree]);

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
      if (matchShortcut(e, appShortcuts['app.graph.toggle'])) {
        e.preventDefault();
        setShowGraph((v) => !v);
        return;
      }
      if (matchShortcut(e, appShortcuts['app.backlinks.toggle'])) {
        e.preventDefault();
        setShowBacklinks((v) => !v);
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

  const handleSidebarToggle = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusModeEnabled((prev) => !prev);
  }, []);

  const handleSelectTab = useCallback(
    (filePath: string) => {
      const tab = tabs.find((t) => t.filePath === filePath);
      if (tab) {
        setActiveTab(tab.id);
      } else {
        setCurrentFile(filePath);
      }
    },
    [tabs, setActiveTab, setCurrentFile]
  );

  const handleCloseTab = useCallback(
    (filePath: string) => {
      closeFile(filePath);
      const remaining = useWorkspaceStore.getState().tabs;
      if (remaining.length > 0) {
        setCurrentFile(remaining[0].filePath);
      } else {
        setCurrentFile(null);
      }
    },
    [closeFile, setCurrentFile]
  );

  const isSidebarHidden = sidebarCollapsed || focusModeEnabled;

  useEffect(() => {
    if (!focusModeEnabled) return;
    setShowBacklinks(false);
    setShowGraph(false);
    setShowQuickSwitcher(false);
    setShowWorkspaceModal(false);
    setShowSettings(false);
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

  const backlinksShortcutLabel = formatShortcutList(appShortcuts['app.backlinks.toggle']);
  const graphShortcutLabel = formatShortcutList(appShortcuts['app.graph.toggle']);

  // Feature 3/4: listen for workspace-open events from Electron
  useEffect(() => {
    if (!window.electronAPI?.onOpenWorkspace) return;
    window.electronAPI.onOpenWorkspace((path) => {
      openWorkspace(path).catch((err) => {
        console.error('[Home] Failed to open workspace from OS:', err);
      });
    });
  }, [openWorkspace]);

  return (
    <ToastProvider>
      <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      {/* Top bar — full width, serves as title bar in Electron */}
      {!focusModeEnabled && (
        <EditorTabRow
          sidebarOpen={!isSidebarHidden && !!metadata}
          sidebarWidth={sidebarWidth}
          onOpenWorkspace={handleOpenWorkspace}
          onToggleSidebar={() => {
            if (focusModeEnabled) {
              setFocusModeEnabled(false);
            }
            setSidebarCollapsed((prev) => !prev);
          }}
          tabs={tabs}
          currentFile={currentFile}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onAddTab={addNewTab}
          rightPanelOpen={rightPanelMode !== 'none'}
          rightPanelWidth={resolvedRightPanelWidth}
          onToggleRightPanel={toggleRightPanel}
        />
      )}
      <div className="flex-1 flex overflow-hidden min-h-0">
      {/* Connection status banner */}
      {connectionState === 'reconnecting' && (
        <div
          className="fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium"
          style={{ backgroundColor: 'var(--accent-primary-12)', color: 'var(--accent-primary)' }}
        >
          <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
          Reconnecting to coordinator...
        </div>
      )}
      {/* LEFT: File browser sidebar - uses negative margin to collapse */}
        <FileBrowser
          ref={fileBrowserRef}
          client={client}
          onFileOpen={handleFileOpen}
          onOpenWorkspace={handleOpenWorkspace}
          onSidebarToggle={handleSidebarToggle}
          isCollapsed={isSidebarHidden}
          onSearch={() => setShowQuickSwitcher(true)}
          onSettings={() => {
            setShowSettings(true);
          }}
        />

      {/* CENTER: Editor panel - flex grows to fill remaining space */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-hidden">
            {client ? (
              <EditorPanel
                client={client}
                onFileRenamed={handleFileRenamed}
                fileTree={fileTree}
                focusModeEnabled={focusModeEnabled}
                onToggleFocusMode={toggleFocusMode}
                onNewNote={handleNewNote}
                onGoToFile={() => setShowQuickSwitcher(true)}
                onAddSelectionToChat={handleAddSelectionToChat}
              />
            ) : (
              <EditorPlaceholder />
            )}
          </div>

          {/* BOTTOM: Status bar */}
            {!focusModeEnabled && (
              <div className="flex items-center border-t" style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
               <div className="flex-1" />
                 <button
                   onClick={() => setShowBacklinks((v) => !v)}
                   className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                   style={{ color: showBacklinks ? 'var(--accent-primary)' : 'var(--foreground-muted)' }}
                   title={backlinksShortcutLabel ? `Toggle backlinks (${backlinksShortcutLabel})` : 'Toggle backlinks'}
                 >
                   <Link2 size={13} />
                   Backlinks
                 </button>
                 <button
                   onClick={() => setShowGraph(true)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                  style={{ color: 'var(--foreground-muted)' }}
                  title={graphShortcutLabel ? `Open graph view (${graphShortcutLabel})` : 'Open graph view'}
               >
                <GitBranch size={13} />
                Graph
              </button>
            </div>
          )}
        </main>

       {/* RIGHT: Chat panel - also uses negative margin for smooth transition */}
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

      {/* Backlinks modal */}
      {!focusModeEnabled && showBacklinks && (
        <ModalOverlay onBackdropClick={() => setShowBacklinks(false)}>
          <BacklinksPanel
            currentFile={currentFile}
            linkIndex={linkIndex}
            onNavigate={handleNavigateToFile}
            onClose={() => setShowBacklinks(false)}
          />
        </ModalOverlay>
      )}

      {/* Graph view modal */}
      {!focusModeEnabled && showGraph && (
        <ModalOverlay onBackdropClick={() => setShowGraph(false)}>
          <GraphView
            linkIndex={linkIndex}
            currentFile={currentFile}
            onNodeClick={handleNavigateToFile}
            onClose={() => setShowGraph(false)}
          />
        </ModalOverlay>
      )}

      {/* Settings modal */}
      {!focusModeEnabled && showSettings && (
        <ModalOverlay maxWidth="5xl" onBackdropClick={() => setShowSettings(false)}>
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </ModalOverlay>
      )}

      {/* Workspace modal */}
      <WorkspaceModal
        isOpen={showWorkspaceModal && !focusModeEnabled}
        onClose={() => setShowWorkspaceModal(false)}
      />

      {/* Quick Switcher */}
      <QuickSwitcher
        isOpen={showQuickSwitcher && !focusModeEnabled}
        onClose={() => setShowQuickSwitcher(false)}
        fileTree={fileTree}
        onSelectFile={handleNavigateToFile}
        onCreateFile={handleCreateFile}
      />
    </div>
    </div>
    </ToastProvider>
  );
}

function EditorPlaceholder() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <div className="text-center text-muted-foreground">
        <div className="text-lg font-medium mb-2">Editor</div>
        <div className="text-sm">Open a file from the sidebar to start editing</div>
      </div>
    </div>
  );
}
