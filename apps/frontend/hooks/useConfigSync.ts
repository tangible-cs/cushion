/**
 * useConfigSync — owns the full ConfigSync lifecycle.
 *
 * Reads `.cushion/*.json` on workspace open, subscribes to store changes
 * to write back, and re-reads on external disk changes.
 *
 * Extracted from page.tsx to keep the shell component focused on layout.
 */

import { useEffect, useRef } from 'react';
import { ConfigSync } from '@/lib/config-sync';
import { DEFAULT_SETTINGS, DEFAULT_WORKSPACE, DEFAULT_CHAT } from '@/lib/config-defaults';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { useChatStore } from '@/stores/chatStore';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type {
  WorkspaceMetadata,
  CushionSettings,
  CushionWorkspace,
  CushionAppearance,
  CushionChat,
} from '@cushion/types';

interface UseConfigSyncOptions {
  client: CoordinatorClient | null;
  metadata: WorkspaceMetadata | null;
  /** Current right-panel UI state, written into workspace.json */
  rightPanelMode: 'none' | 'chat';
  rightPanelWidth: number;
  /** Called when workspace.json is loaded with the persisted right-panel state */
  onRightPanelRestore: (mode: 'none' | 'chat', width: number) => void;
}

/**
 * Returns a ref that is `true` once workspace.json has been loaded
 * (so writes triggered before that point don't overwrite saved state).
 */
export function useConfigSync({
  client,
  metadata,
  rightPanelMode,
  rightPanelWidth,
  onRightPanelRestore,
}: UseConfigSyncOptions) {
  const configSyncRef = useRef<ConfigSync | null>(null);
  const workspaceConfigLoadedRef = useRef(false);
  // Preserve the full on-disk settings object so unknown keys survive round-trips
  const lastSettingsRef = useRef<CushionSettings>(DEFAULT_SETTINGS);

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

  // Load all config files when a workspace opens
  useEffect(() => {
    if (!metadata || !configSyncRef.current) return;
    workspaceConfigLoadedRef.current = false;
    let cancelled = false;
    const sync = configSyncRef.current;

    (async () => {
      // --- settings.json ---
      const parsedSettings = await sync.read<CushionSettings>('settings.json');
      if (cancelled) return;
      if (parsedSettings) {
        const merged = { ...DEFAULT_SETTINGS, ...parsedSettings };
        lastSettingsRef.current = merged;
        useWorkspaceStore.getState().updatePreferences(merged);
      }

      // --- workspace.json ---
      const parsedWorkspace = await sync.read<CushionWorkspace>('workspace.json');
      if (cancelled) return;
      if (parsedWorkspace) {
        const merged = { ...DEFAULT_WORKSPACE, ...parsedWorkspace };

        // Restore right panel state
        if (merged.rightPanel) {
          onRightPanelRestore(merged.rightPanel.mode, merged.rightPanel.width);
        }

        // Restore tabs
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
              console.warn(`[ConfigSync] Skipping missing tab: ${tab.filePath}`);
            }
          }
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

      // --- appearance.json ---
      const parsedAppearance = await sync.read<CushionAppearance>('appearance.json');
      if (cancelled) return;
      if (parsedAppearance) {
        useAppearanceStore.getState().loadAppearance(parsedAppearance);
      }

      // --- chat.json ---
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

  // Write settings.json when preferences change
  useEffect(() => {
    if (!metadata) return;

    return useWorkspaceStore.subscribe(
      (state) => state.preferences,
      (prefs) => {
        // Spread over last-read disk object to preserve unknown keys
        const settings: CushionSettings = { ...lastSettingsRef.current, ...prefs };
        lastSettingsRef.current = settings;
        configSyncRef.current?.scheduleWrite('settings.json', settings);
      },
    );
  }, [metadata]);

  // Write workspace.json when tabs or active file change
  useEffect(() => {
    if (!metadata) return;

    return useWorkspaceStore.subscribe(
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
  }, [metadata, rightPanelMode, rightPanelWidth]);

  // Write appearance.json when appearance changes
  useEffect(() => {
    if (!metadata) return;

    return useAppearanceStore.subscribe(
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
        configSyncRef.current?.scheduleWrite(
          'appearance.json',
          useAppearanceStore.getState().getConfig(),
        );
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );
  }, [metadata]);

  // Write chat.json when chat preferences change
  useEffect(() => {
    if (!metadata) return;
    const directory = metadata.projectPath;

    return useChatStore.subscribe(
      (state) => ({
        displayPreferences: state.displayPreferences,
        modelVisibility: state.modelVisibility,
        selectedModel: state.selectedModelByDirectory[directory] ?? state.selectedModel,
        selectedAgent: state.selectedAgentByDirectory[directory] ?? state.selectedAgent,
        selectedVariant: state.selectedVariantByDirectory[directory] ?? state.selectedVariant,
      }),
      (slice) => {
        const chatData: CushionChat = {
          selectedModel: slice.selectedModel,
          selectedAgent: slice.selectedAgent,
          selectedVariant: slice.selectedVariant,
          displayPreferences: slice.displayPreferences,
          modelVisibility: slice.modelVisibility,
        };
        configSyncRef.current?.scheduleWrite('chat.json', chatData);
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
    );
  }, [metadata]);

  // Re-read config files when externally changed on disk
  useEffect(() => {
    if (!client || !metadata) return;

    return client.onConfigChanged(async (file: string) => {
      const sync = configSyncRef.current;
      if (!sync) return;

      switch (file) {
        case 'settings.json': {
          const parsed = await sync.read<CushionSettings>('settings.json');
          if (!parsed) return;
          const merged = { ...DEFAULT_SETTINGS, ...parsed };
          lastSettingsRef.current = merged;
          useWorkspaceStore.getState().updatePreferences(merged);
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
      }
    });
  }, [client, metadata]);

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

  // Flush pending config writes on page unload
  useEffect(() => {
    const handler = () => configSyncRef.current?.flush();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  return { workspaceConfigLoadedRef };
}
