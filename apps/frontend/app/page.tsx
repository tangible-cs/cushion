'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TerminalSquare, Link2, GitBranch } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useChatStore } from '@/stores/chatStore';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { FileBrowser, FileBrowserHandle } from '@/components/workspace/FileBrowser';
import { WorkspaceModal } from '@/components/workspace/WorkspaceModal';
import { TerminalPanel } from '@/components/terminal/TerminalPanel';
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
import type { CoordinatorClient } from '@/lib/coordinator-client';

const APP_SHORTCUT_IDS = [
  'app.quickSwitcher.open',
  'app.chat.newSession',
  'app.terminal.toggle',
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

export default function Home() {
  const { metadata, openFile, setClient, currentFile, openWorkspace, recentProjects } = useWorkspaceStore();
  const openFiles = useWorkspaceStore((state) => state.openFiles);
  const connectChat = useChatStore((state) => state.connect);
  const disconnectChat = useChatStore((state) => state.disconnect);
  const addContextItem = useChatStore((state) => state.addContextItem);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const [client, setClientLocal] = useState<CoordinatorClient | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [terminalVisible, setTerminalVisible] = useState(false);
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
      if (matchShortcut(e, appShortcuts['app.chat.newSession'])) {
        e.preventDefault();
        setRightPanelMode('chat');
        setActiveSession(null).catch(() => undefined);
        return;
      }
      if (matchShortcut(e, appShortcuts['app.terminal.toggle'])) {
        e.preventDefault();
        setTerminalVisible((v) => !v);
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
  }, [appShortcuts, closeTopmostAppOverlay, focusModeEnabled, setActiveSession]);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('cushion-right-panel') : null;
    if (!stored) return;
    if (stored === 'chat' || stored === 'none') {
      setRightPanelMode(stored);
    } else if (stored === 'backlinks') {
      setRightPanelMode('none');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('cushion-right-panel-width');
    if (!stored) return;
    const parsed = Number(stored);
    if (!Number.isFinite(parsed)) return;
    setRightPanelWidth(parsed);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cushion-right-panel', rightPanelMode);
  }, [rightPanelMode]);

  useEffect(() => {
    if (rightPanelMode !== 'none') {
      lastRightPanelModeRef.current = rightPanelMode;
    }
  }, [rightPanelMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cushion-right-panel-width', String(rightPanelWidth));
  }, [rightPanelWidth]);

  const handleFileOpen = useCallback(
    (filePath: string, content: string) => {
      openFile(filePath, content);
    },
    [openFile]
  );

  const handleOpenWorkspace = useCallback(() => {
    setShowWorkspaceModal(true);
  }, []);

  const openChatSidebar = useCallback(() => {
    setRightPanelMode('chat');
  }, []);

  const toggleRightPanel = useCallback(() => {
    setRightPanelMode((mode) => (mode === 'none' ? lastRightPanelModeRef.current : 'none'));
  }, []);

  const handleAskAIFile = useCallback((filePath: string) => {
    addContextItem({ path: filePath });
    setRightPanelMode('chat');
  }, [addContextItem]);

  const handleSidebarToggle = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusModeEnabled((prev) => !prev);
  }, []);

  const isSidebarHidden = sidebarCollapsed || focusModeEnabled;

  useEffect(() => {
    if (!focusModeEnabled) return;
    setTerminalVisible(false);
    setShowBacklinks(false);
    setShowGraph(false);
    setShowQuickSwitcher(false);
    setShowWorkspaceModal(false);
    setShowSettings(false);
  }, [focusModeEnabled]);

  const rightPanelMin = 280;
  const rightPanelMax = typeof window !== 'undefined'
    ? Math.max(rightPanelMin, Math.floor(window.innerWidth * 0.45))
    : 520;
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
      openFile(filePath, '');
    } catch (err) {
      console.error('[Page] Failed to create file:', err);
    }
  }, [client, openFile, fetchFileTree]);

  const terminalShortcutLabel = formatShortcutList(appShortcuts['app.terminal.toggle']);
  const backlinksShortcutLabel = formatShortcutList(appShortcuts['app.backlinks.toggle']);
  const graphShortcutLabel = formatShortcutList(appShortcuts['app.graph.toggle']);

  return (
    <ToastProvider>
      <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex">
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
          onAskAIFile={handleAskAIFile}
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
                sidebarCollapsed={isSidebarHidden && !!metadata}
                onExpandSidebar={() => {
                  if (focusModeEnabled) {
                    setFocusModeEnabled(false);
                  }
                  setSidebarCollapsed(false);
                }}
                focusModeEnabled={focusModeEnabled}
                onToggleFocusMode={toggleFocusMode}
                onOpenChat={openChatSidebar}
                rightPanelOpen={rightPanelMode !== 'none'}
                onToggleRightPanel={toggleRightPanel}
              />
            ) : (
              <EditorPlaceholder />
            )}
          </div>

          {/* BOTTOM: Terminal toggle bar + panel */}
            {!focusModeEnabled && !terminalVisible && (
              <div className="flex items-center border-t" style={{ backgroundColor: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setTerminalVisible(true)}
                 className="flex items-center gap-1.5 px-3 py-1 text-xs transition-colors"
                 style={{ color: 'var(--foreground-muted)' }}
               >
                 <TerminalSquare size={13} />
                 Terminal
                 {terminalShortcutLabel && (
                   <span className="ml-1" style={{ color: 'var(--foreground-subtle)' }}>
                     {terminalShortcutLabel}
                   </span>
                 )}
               </button>
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
          {!focusModeEnabled && (
            <TerminalPanel
              isVisible={terminalVisible}
              onClose={() => setTerminalVisible(false)}
            />
          )}
        </main>

       {/* RIGHT: Chat panel - also uses negative margin for smooth transition */}
        <aside
          className="relative h-screen flex-shrink-0 border-l border-border bg-background transition-[margin] duration-300 ease-in-out"
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
