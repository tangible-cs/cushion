'use client';

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
import { ConfigSync } from '@/lib/config-sync';
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE, DEFAULT_CHAT } from '@/lib/config-defaults';
import { useAppearanceStore } from '@/stores/appearanceStore';
import type { CushionSettings, CushionWorkspace, CushionAppearance, CushionChat } from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';

const APP_SHORTCUT_IDS = [
  'app.quickSwitcher.open',
  'app.chat.newSession',
  'app.graph.toggle',
  'app.backlinks.toggle',
  'app.overlay.close',
  'app.focusMode.exit',
] as const;

const BINARY_NAVIGATION_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf)$/i;

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
  const configSyncRef = useRef<ConfigSync | null>(null);
  const lastSettingsRef = useRef<CushionSettings>(DEFAULT_SETTINGS);
  const workspaceConfigLoadedRef = useRef(false);

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

  // --- ConfigSync lifecycle ---

  // Create / destroy ConfigSync when client connects
  useEffect(() => {
    if (!client) return;
    configSyncRef.current = new ConfigSync(client);
    return () => {
      configSyncRef.current?.flush();
      configSyncRef.current?.destroy();
      configSyncRef.current = null;
    };
  }, [client]);

  // Load settings.json + workspace.json when a workspace opens
  useEffect(() => {
    if (!metadata || !configSyncRef.current) return;
    workspaceConfigLoadedRef.current = false;
    let cancelled = false;
    const sync = configSyncRef.current;

    (async () => {
      // Load settings.json
      const parsedSettings = await sync.read<CushionSettings>('settings.json');
      if (cancelled) return;
      if (parsedSettings) {
        const merged = { ...DEFAULT_SETTINGS, ...parsedSettings };
        lastSettingsRef.current = merged;
        useWorkspaceStore.getState().updatePreferences({
          showHiddenFiles: merged.showHiddenFiles,
          showCushionFiles: merged.showCushionFiles,
          autoSave: merged.autoSave,
          autoSaveDelay: merged.autoSaveDelay,
          showLineNumber: merged.showLineNumber,
          spellcheck: merged.spellcheck,
          readableLineLength: merged.readableLineLength,
          autoPairBrackets: merged.autoPairBrackets,
          foldHeading: merged.foldHeading,
          foldIndent: merged.foldIndent,
        });
      }

      // Load workspace.json — restore right panel + tabs
      const parsedWorkspace = await sync.read<CushionWorkspace>('workspace.json');
      if (cancelled) return;
      if (parsedWorkspace) {
        const merged = { ...DEFAULT_WORKSPACE, ...parsedWorkspace };

        // Restore right panel state
        if (merged.rightPanel) {
          setRightPanelMode(merged.rightPanel.mode);
          setRightPanelWidth(merged.rightPanel.width);
          if (merged.rightPanel.mode !== 'none') {
            lastRightPanelModeRef.current = merged.rightPanel.mode;
          }
        }

        // Restore tabs — re-open each file from disk
        if (merged.tabs.length > 0 && client) {
          const activeFilePath = merged.activeTab;
          for (const tab of merged.tabs) {
            try {
              const { content } = await client.readFile(tab.filePath);
              if (cancelled) return;
              useWorkspaceStore.getState().openFile(tab.filePath, content);
              if (tab.isPinned) {
                const currentTabs = useWorkspaceStore.getState().tabs;
                const restored = currentTabs.find((t) => t.filePath === tab.filePath);
                if (restored) useWorkspaceStore.getState().pinTab(restored.id);
              }
            } catch {
              // File may have been deleted since workspace.json was saved — skip
              console.warn(`[ConfigSync] Skipping missing tab: ${tab.filePath}`);
            }
          }
          // Set active tab by filePath
          if (activeFilePath) {
            const currentTabs = useWorkspaceStore.getState().tabs;
            const activeTab = currentTabs.find((t) => t.filePath === activeFilePath);
            if (activeTab) {
              useWorkspaceStore.getState().setActiveTab(activeTab.id);
            }
          }
        }
      }

      workspaceConfigLoadedRef.current = true;

      // Load appearance.json — restore theme, accent color, fonts
      const parsedAppearance = await sync.read<CushionAppearance>('appearance.json');
      if (cancelled) return;
      if (parsedAppearance) {
        useAppearanceStore.getState().loadAppearance(parsedAppearance);
      }

      // Load chat.json — restore AI preferences for this workspace
      const parsedChat = await sync.read<CushionChat>('chat.json');
      if (cancelled) return;
      if (parsedChat) {
        const merged = { ...DEFAULT_CHAT, ...parsedChat };
        const directory = metadata.projectPath;
        useChatStore.setState((state) => ({
          displayPreferences: merged.displayPreferences,
          modelVisibility: { ...state.modelVisibility, ...merged.modelVisibility },
          ...(merged.selectedModel && {
            selectedModel: merged.selectedModel,
            selectedModelByDirectory: {
              ...state.selectedModelByDirectory,
              [directory]: merged.selectedModel,
            },
          }),
          ...(merged.selectedAgent !== null && {
            selectedAgent: merged.selectedAgent,
            selectedAgentByDirectory: {
              ...state.selectedAgentByDirectory,
              [directory]: merged.selectedAgent,
            },
          }),
          ...(merged.selectedVariant !== null && {
            selectedVariant: merged.selectedVariant,
            selectedVariantByDirectory: {
              ...state.selectedVariantByDirectory,
              [directory]: merged.selectedVariant,
            },
          }),
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [metadata, client]);

  // Write to settings.json when preferences change
  useEffect(() => {
    if (!metadata) return;

    const unsub = useWorkspaceStore.subscribe(
      (state) => state.preferences,
      (prefs) => {
        const sync = configSyncRef.current;
        if (!sync) return;

        const settings: CushionSettings = {
          ...lastSettingsRef.current,
          showHiddenFiles: prefs.showHiddenFiles,
          showCushionFiles: prefs.showCushionFiles,
          autoSave: prefs.autoSave,
          autoSaveDelay: prefs.autoSaveDelay,
          showLineNumber: prefs.showLineNumber,
          spellcheck: prefs.spellcheck,
          readableLineLength: prefs.readableLineLength,
          autoPairBrackets: prefs.autoPairBrackets,
          foldHeading: prefs.foldHeading,
          foldIndent: prefs.foldIndent,
        };
        lastSettingsRef.current = settings;
        sync.scheduleWrite('settings.json', settings);
      },
    );

    return unsub;
  }, [metadata]);

  // Write to workspace.json when tabs or active file change
  useEffect(() => {
    if (!metadata) return;

    const unsub = useWorkspaceStore.subscribe(
      (state) => ({ tabs: state.tabs, currentFile: state.currentFile }),
      ({ tabs, currentFile }) => {
        const sync = configSyncRef.current;
        if (!sync) return;

        const workspaceData: CushionWorkspace = {
          tabs: tabs.map((t) => ({
            id: t.id,
            filePath: t.filePath,
            isPinned: t.isPinned,
            isPreview: t.isPreview,
            order: t.order,
          })),
          activeTab: currentFile,
          rightPanel: { mode: rightPanelMode, width: rightPanelWidth },
          lastOpenFiles: tabs.map((t) => t.filePath),
        };
        sync.scheduleWrite('workspace.json', workspaceData);
      },
    );

    return unsub;
  }, [metadata, rightPanelMode, rightPanelWidth]);

  // Write to appearance.json when appearance changes
  useEffect(() => {
    if (!metadata) return;

    const unsub = useAppearanceStore.subscribe(
      (state) => ({
        theme: state.theme,
        accentColor: state.accentColor,
        baseFontSize: state.baseFontSize,
        textFontFamily: state.textFontFamily,
        monospaceFontFamily: state.monospaceFontFamily,
        interfaceFontFamily: state.interfaceFontFamily,
        sidebarWidth: state.sidebarWidth,
      }),
      () => {
        const sync = configSyncRef.current;
        if (!sync) return;

        sync.scheduleWrite('appearance.json', useAppearanceStore.getState().getConfig());
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );

    return unsub;
  }, [metadata]);

  // Write to chat.json when chat preferences change
  useEffect(() => {
    if (!metadata) return;
    const directory = metadata.projectPath;

    const unsub = useChatStore.subscribe(
      (state) => ({
        displayPreferences: state.displayPreferences,
        modelVisibility: state.modelVisibility,
        selectedModel: state.selectedModelByDirectory[directory] ?? state.selectedModel,
        selectedAgent: state.selectedAgentByDirectory[directory] ?? state.selectedAgent,
        selectedVariant: state.selectedVariantByDirectory[directory] ?? state.selectedVariant,
      }),
      (slice) => {
        const sync = configSyncRef.current;
        if (!sync) return;

        const chatData: CushionChat = {
          selectedModel: slice.selectedModel,
          selectedAgent: slice.selectedAgent,
          selectedVariant: slice.selectedVariant,
          displayPreferences: slice.displayPreferences,
          modelVisibility: slice.modelVisibility,
        };
        sync.scheduleWrite('chat.json', chatData);
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );

    return unsub;
  }, [metadata]);

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

  // Re-read config files when externally changed on disk
  useEffect(() => {
    if (!client || !metadata) return;

    const unsub = client.onConfigChanged(async (file: string) => {
      const sync = configSyncRef.current;
      if (!sync) return;

      switch (file) {
        case 'settings.json': {
          const parsed = await sync.read<CushionSettings>('settings.json');
          if (!parsed) return;
          const merged = { ...DEFAULT_SETTINGS, ...parsed };
          lastSettingsRef.current = merged;
          useWorkspaceStore.getState().updatePreferences({
            showHiddenFiles: merged.showHiddenFiles,
            showCushionFiles: merged.showCushionFiles,
            autoSave: merged.autoSave,
            autoSaveDelay: merged.autoSaveDelay,
            showLineNumber: merged.showLineNumber,
            spellcheck: merged.spellcheck,
            readableLineLength: merged.readableLineLength,
            autoPairBrackets: merged.autoPairBrackets,
              foldHeading: merged.foldHeading,
            foldIndent: merged.foldIndent,
          });
          break;
        }
        case 'appearance.json': {
          const parsed = await sync.read<CushionAppearance>('appearance.json');
          if (!parsed) return;
          useAppearanceStore.getState().loadAppearance(parsed);
          break;
        }
        case 'chat.json': {
          const parsed = await sync.read<CushionChat>('chat.json');
          if (!parsed) return;
          const merged = { ...DEFAULT_CHAT, ...parsed };
          const directory = metadata.projectPath;
          useChatStore.setState((state) => ({
            displayPreferences: merged.displayPreferences,
            modelVisibility: { ...state.modelVisibility, ...merged.modelVisibility },
            ...(merged.selectedModel && {
              selectedModel: merged.selectedModel,
              selectedModelByDirectory: {
                ...state.selectedModelByDirectory,
                [directory]: merged.selectedModel,
              },
            }),
            ...(merged.selectedAgent !== null && {
              selectedAgent: merged.selectedAgent,
              selectedAgentByDirectory: {
                ...state.selectedAgentByDirectory,
                [directory]: merged.selectedAgent,
              },
            }),
            ...(merged.selectedVariant !== null && {
              selectedVariant: merged.selectedVariant,
              selectedVariantByDirectory: {
                ...state.selectedVariantByDirectory,
                [directory]: merged.selectedVariant,
              },
            }),
          }));
          break;
        }
        // workspace.json is not re-read on external change — tabs are ephemeral
        // and re-reading could disrupt the user's current session
      }
    });

    return unsub;
  }, [client, metadata]);

  // Flush pending config writes on page unload
  useEffect(() => {
    const handler = () => configSyncRef.current?.flush();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // --- End ConfigSync lifecycle ---

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
    if (rightPanelMode !== 'none') {
      lastRightPanelModeRef.current = rightPanelMode;
    }
  }, [rightPanelMode]);

  // Write workspace.json when right panel state changes
  useEffect(() => {
    if (!metadata || !workspaceConfigLoadedRef.current) return;
    const sync = configSyncRef.current;
    if (!sync) return;

    const { tabs, currentFile } = useWorkspaceStore.getState();
    const workspaceData: CushionWorkspace = {
      tabs: tabs.map((t) => ({
        id: t.id,
        filePath: t.filePath,
        isPinned: t.isPinned,
        isPreview: t.isPreview,
        order: t.order,
      })),
      activeTab: currentFile,
      rightPanel: { mode: rightPanelMode, width: rightPanelWidth },
      lastOpenFiles: tabs.map((t) => t.filePath),
    };
    sync.scheduleWrite('workspace.json', workspaceData);
  }, [metadata, rightPanelMode, rightPanelWidth]);

  const handleFileOpen = useCallback(
    (filePath: string, content: string) => {
      openFile(filePath, content);
    },
    [openFile]
  );

  const handleOpenWorkspace = useCallback(() => {
    setShowWorkspaceModal(true);
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
      if (BINARY_NAVIGATION_EXTENSIONS.test(filePath)) {
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
      openFile(filePath, '');
    } catch (err) {
      console.error('[Page] Failed to create file:', err);
    }
  }, [client, openFile, fetchFileTree]);

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
                rightPanelOpen={rightPanelMode !== 'none'}
                onToggleRightPanel={toggleRightPanel}
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
          className="relative h-screen flex-shrink-0 border-l border-border bg-sidebar-bg transition-[margin] duration-300 ease-in-out"
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
