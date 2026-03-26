import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  WorkspaceState,
  WorkspaceMetadata,
  FileState,
  TabState,
  WorkspacePreferences,
  Frontmatter,
} from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import { DEFAULT_SETTINGS } from '@/lib/config-defaults';
import { parseFrontmatter } from '@/lib/frontmatter';

interface WorkspaceActions {
  // Client setup
  setClient: (client: CoordinatorClient) => void;

  // Workspace lifecycle
  openWorkspace: (projectPath: string) => Promise<void>;
  selectWorkspaceFolder: () => Promise<string | null>;
  closeWorkspace: () => void;

  // File operations
  openFile: (filePath: string, content: string, forceNewTab?: boolean) => void;
  closeFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;
  markFileSaved: (filePath: string, content: string) => void;
  replaceOpenFileContent: (filePath: string, content: string) => void;
  setCurrentFile: (filePath: string | null) => void;

  // Tab management
  addTab: (filePath: string, isPreview?: boolean) => void;
  addNewTab: () => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  convertPreviewTab: (filePath: string) => void;

  // Recent history
  addRecentProject: () => void;

  // Preferences
  updatePreferences: (preferences: Partial<WorkspacePreferences>) => void;

  // Layout
  setSidebarWidth: (width: number) => void;

  // Error handling
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;

  // File tree
  setFlatFileList: (paths: string[]) => void;

  // Utilities
  reset: () => void;
}

const initialState: Omit<WorkspaceState, keyof WorkspaceActions> = {
  metadata: null,
  openFiles: new Map(),
  tabs: [],
  currentFile: null,
  flatFileList: [],
  fileWatcher: {
    watchedPaths: [],
    ignoredPatterns: [],
    hasExternalChanges: new Map(),
  },
  recentProjects: [],
  recentFiles: [],
  preferences: { ...DEFAULT_SETTINGS },
  sidebarWidth: 240,
  sessionId: '',
  isLoading: false,
  error: null,
};

let coordinatorClient: CoordinatorClient | null = null;

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    txt: 'plaintext',
    log: 'plaintext',
    conf: 'plaintext',
    ini: 'plaintext',
    cfg: 'plaintext',
  };
  return languageMap[ext || ''] || 'plaintext';
}

function supportsFrontmatter(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

function extractFrontmatter(filePath: string, content: string): Frontmatter | null {
  if (!supportsFrontmatter(filePath)) {
    return null;
  }

  const { frontmatter, errors } = parseFrontmatter(content);

  if (errors.length > 0) {
    console.warn('[WorkspaceStore] Frontmatter parsing warnings:', errors);
  }

  return frontmatter;
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        setClient: (client: CoordinatorClient) => {
          coordinatorClient = client;
        },

        openWorkspace: async (projectPath: string) => {
          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          set({ isLoading: true, error: null });

          try {
            const previousProjectPath = get().metadata?.projectPath;
            const { projectName, gitRoot } = await coordinatorClient.openWorkspace(projectPath);

            const metadata: WorkspaceMetadata = {
              projectPath,
              projectName,
              lastOpened: Date.now(),
              gitRoot: gitRoot || undefined,
            };

            const isWorkspaceSwitch = previousProjectPath !== projectPath;

            set((state) => ({
              metadata,
              isLoading: false,
              error: null,
              ...(isWorkspaceSwitch
                ? {
                    openFiles: new Map(),
                    tabs: [],
                    currentFile: null,
                    flatFileList: [],
                    fileWatcher: {
                      ...state.fileWatcher,
                      hasExternalChanges: new Map(),
                    },
                  }
                : {}),
            }));

            get().addRecentProject();

            // Feature 3: notify Electron so the OS shows recent workspaces
            window.electronAPI?.notifyWorkspaceOpened?.(projectPath);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            set({
              error: errorMessage,
              isLoading: false,
            });
            console.error('[WorkspaceStore] Failed to open workspace:', error);
            throw error instanceof Error ? error : new Error(errorMessage);
          }
        },

        selectWorkspaceFolder: async () => {
          // In Electron, use the native dialog directly
          if (window.electronAPI?.selectFolder) {
            return window.electronAPI.selectFolder();
          }

          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          const { path } = await coordinatorClient.selectWorkspaceFolder();
          return path;
        },

        closeWorkspace: () => {
          set(initialState);
        },

        openFile: (filePath: string, content: string, forceNewTab: boolean = false) => {
          const { metadata, openFiles, tabs } = get();

          if (!metadata) {
            return;
          }

          // If file already has a tab, just switch to it
          const existingTab = tabs.find((t) => t.filePath === filePath);
          if (existingTab) {
            get().setActiveTab(existingTab.id);

            // Still need to load the file if not in openFiles
            if (!openFiles.get(filePath)) {
              const frontmatter = extractFrontmatter(filePath, content);
              const fileState: FileState = {
                filePath,
                absolutePath: `${metadata.projectPath}/${filePath}`,
                content,
                savedContent: content,
                isDirty: false,
                version: 1,
                language: detectLanguage(filePath),
                encoding: 'utf-8',
                lineEnding: 'LF',
                lastSaved: Date.now(),
                frontmatter,
              };
              const newOpenFiles = new Map(openFiles);
              newOpenFiles.set(filePath, fileState);
              set({ openFiles: newOpenFiles });
            }
            return;
          }

          // Parse frontmatter for markdown files
          const frontmatter = extractFrontmatter(filePath, content);

          const fileState: FileState = {
            filePath,
            absolutePath: `${metadata.projectPath}/${filePath}`,
            content,
            savedContent: content,
            isDirty: false,
            version: 1,
            language: detectLanguage(filePath),
            encoding: 'utf-8',
            lineEnding: 'LF',
            lastSaved: Date.now(),
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, fileState);

          // Replace __new_tab__ placeholder if one is active
          const newTabPlaceholder = tabs.find((t) => t.filePath === '__new_tab__');
          if (newTabPlaceholder) {
            const newTabs = tabs.map((t) =>
              t.id === newTabPlaceholder.id
                ? { ...t, filePath, isActive: true, isPreview: false }
                : { ...t, isActive: false }
            );
            set({
              tabs: newTabs,
              openFiles: newOpenFiles,
              currentFile: filePath,
            });
            return;
          }

          get().addTab(filePath, false);

          set({
            openFiles: newOpenFiles,
            currentFile: filePath,
          });
        },

        closeFile: (filePath: string) => {
          const { openFiles } = get();

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.delete(filePath);

          const tabs = get().tabs;
          const tab = tabs.find((t) => t.filePath === filePath);
          if (tab) {
            get().removeTab(tab.id);
          }

          set({ openFiles: newOpenFiles });
        },

        updateFileContent: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);

          if (!file) {
            return;
          }

          // Re-parse frontmatter if the file supports it
          const frontmatter = extractFrontmatter(filePath, content);

          const updatedFile: FileState = {
            ...file,
            content,
            version: file.version + 1,
            isDirty: content !== file.savedContent,
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);

          set({ openFiles: newOpenFiles });

          // Editing a file converts its preview tab to permanent (Obsidian behavior)
          const previewTab = get().tabs.find((t) => t.filePath === filePath && t.isPreview);
          if (previewTab) {
            get().convertPreviewTab(filePath);
          }
        },

        markFileSaved: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);

          if (!file) return;

          const updatedFile: FileState = {
            ...file,
            savedContent: content,
            isDirty: file.content !== content,
            lastSaved: Date.now(),
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);

          set({ openFiles: newOpenFiles });
        },

        /**
         * Replace content of an already-open file (e.g. after external disk change).
         * Atomically updates both content and savedContent so the editor refreshes
         * without a transient dirty state.
         */
        replaceOpenFileContent: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);
          if (!file) return;
          if (file.content === content && file.savedContent === content) return;

          const frontmatter = extractFrontmatter(filePath, content);
          const updatedFile: FileState = {
            ...file,
            content,
            savedContent: content,
            isDirty: false,
            version: file.version + 1,
            lastSaved: Date.now(),
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);
          set({ openFiles: newOpenFiles });
        },

        setCurrentFile: (filePath: string | null) => {
          set({ currentFile: filePath });
        },

        addTab: (filePath: string, isPreview: boolean = false) => {
          const { tabs } = get();

          // Preview mode: reuse existing preview tab if there is one
          if (isPreview) {
            const previewTabIndex = tabs.findIndex((t) => t.isPreview);
            if (previewTabIndex !== -1) {
              const newTabs = tabs.map((t, i) =>
                i === previewTabIndex
                  ? { ...t, filePath, isActive: true }
                  : { ...t, isActive: false }
              );
              set({ tabs: newTabs, currentFile: filePath });
              return;
            }
          }

          const newTab: TabState = {
            id: `tab-${Date.now()}-${Math.random()}`,
            filePath,
            isActive: true,
            isPinned: false,
            isPreview,
            order: tabs.length,
          };

          const newTabs = tabs.map((t) => ({ ...t, isActive: false }));
          newTabs.push(newTab);

          set({
            tabs: newTabs,
            currentFile: filePath,
          });
        },

        addNewTab: () => {
          const { tabs } = get();
          const newTab: TabState = {
            id: `tab-${Date.now()}-${Math.random()}`,
            filePath: '__new_tab__',
            isActive: true,
            isPinned: false,
            isPreview: false,
            order: tabs.length,
          };

          const newTabs = tabs.map((t) => ({ ...t, isActive: false }));
          newTabs.push(newTab);

          set({
            tabs: newTabs,
            currentFile: '__new_tab__',
          });
        },

        removeTab: (tabId: string) => {
          const { tabs, currentFile } = get();
          const newTabs = tabs.filter((t) => t.id !== tabId);

          const removedTab = tabs.find((t) => t.id === tabId);
          if (removedTab?.filePath === currentFile && newTabs.length > 0) {
            newTabs[0].isActive = true;
            set({ currentFile: newTabs[0].filePath });
          }

          set({ tabs: newTabs });
        },

        setActiveTab: (tabId: string) => {
          const { tabs } = get();
          const newTabs = tabs.map((t) => ({
            ...t,
            isActive: t.id === tabId,
          }));

          const activeTab = newTabs.find((t) => t.id === tabId);
          if (activeTab) {
            set({
              tabs: newTabs,
              currentFile: activeTab.filePath,
            });
          }
        },

        pinTab: (tabId: string) => {
          const { tabs } = get();
          const newTabs = tabs.map((t) =>
            t.id === tabId ? { ...t, isPinned: !t.isPinned } : t
          );
          set({ tabs: newTabs });
        },

        convertPreviewTab: (filePath: string) => {
          const { tabs } = get();
          const newTabs = tabs.map((t) =>
            t.filePath === filePath ? { ...t, isPreview: false } : t
          );
          set({ tabs: newTabs });
        },

        addRecentProject: () => {
          const { metadata } = get();
          if (!metadata) return;

          set((state) => {
            const filtered = state.recentProjects.filter(
              (p) => p.projectPath !== metadata.projectPath
            );

            return {
              recentProjects: [metadata, ...filtered].slice(0, 10),
            };
          });
        },

        updatePreferences: (preferences: Partial<WorkspacePreferences>) => {
          set((state) => ({
            preferences: {
              ...state.preferences,
              ...preferences,
            },
          }));
        },

        setSidebarWidth: (width: number) => {
          set({ sidebarWidth: width });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        setLoading: (isLoading: boolean) => {
          set({ isLoading });
        },

        setFlatFileList: (paths: string[]) => {
          set({ flatFileList: paths });
        },

        reset: () => {
          set(initialState);
        },
      }),
      {
        name: 'cushion-workspace',
        // Only persist recentProjects — preferences are loaded from disk (settings.json)
        partialize: (state) => ({
          recentProjects: state.recentProjects,
        }),
      }
    )
  )
);
