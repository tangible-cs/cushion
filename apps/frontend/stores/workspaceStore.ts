/**
 * Workspace State Management with Zustand
 *
 * Manages workspace context, open files, tabs, and user preferences
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  WorkspaceState,
  WorkspaceMetadata,
  FileState,
  FileTreeNode,
  TabState,
  WorkspacePreferences,
  Frontmatter,
} from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import { parseFrontmatter } from '@/lib/frontmatter';

/**
 * Actions for workspace management
 */
interface WorkspaceActions {
  // Client setup
  setClient: (client: CoordinatorClient) => void;

  // Workspace lifecycle
  openWorkspace: (projectPath: string) => Promise<void>;
  selectWorkspaceFolder: () => Promise<string | null>;
  closeWorkspace: () => void;

  // File operations
  openFile: (filePath: string, content: string) => void;
  closeFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;
  markFileDirty: (filePath: string) => void;
  markFileSaved: (filePath: string, content: string) => void;
  setCurrentFile: (filePath: string | null) => void;

  // Tab management
  addTab: (filePath: string, isPreview?: boolean) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  convertPreviewTab: (filePath: string) => void;

  // Recent history
  addRecentProject: () => void;

  // Preferences
  updatePreferences: (preferences: Partial<WorkspacePreferences>) => void;

  // Error handling
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;

  // File tree
  setFileTree: (tree: FileTreeNode[]) => void;

  // Utilities
  reset: () => void;
}

/**
 * Initial state
 */
const initialState: Omit<WorkspaceState, keyof WorkspaceActions> = {
  metadata: null,
  openFiles: new Map(),
  tabs: [],
  currentFile: null,
  fileTree: [],
  fileWatcher: {
    watchedPaths: [],
    ignoredPatterns: ['node_modules', '.git', 'dist', 'build', '.next'],
    hasExternalChanges: new Map(),
  },
  recentProjects: [],
  recentFiles: [],
  preferences: {
    showHiddenFiles: false,
    fileTreeCollapsed: false,
    sidebarWidth: 240,
    autoSave: true,
    autoSaveDelay: 1000,
  },
  sessionId: '',
  isLoading: false,
  error: null,
};

/**
 * Client instance (set from Editor component)
 */
let coordinatorClient: CoordinatorClient | null = null;

/**
 * Helper: Detect language from file extension
 */
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

/**
 * Helper: Check if file supports frontmatter (markdown files)
 */
function supportsFrontmatter(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

/**
 * Helper: Extract frontmatter from content if the file supports it
 */
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

/**
 * Workspace Store
 */
export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        /**
         * Set the coordinator client
         */
        setClient: (client: CoordinatorClient) => {
          coordinatorClient = client;
        },

        /**
         * Open a workspace by project path
         */
        openWorkspace: async (projectPath: string) => {
          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          set({ isLoading: true, error: null });

          try {
            const { projectName, gitRoot } = await coordinatorClient.openWorkspace(projectPath);

            const metadata: WorkspaceMetadata = {
              projectPath,
              projectName,
              lastOpened: Date.now(),
              gitRoot: gitRoot || undefined,
            };

            set({
              metadata,
              isLoading: false,
            });

            get().addRecentProject();
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

        /**
         * Ask the coordinator to show a native folder picker
         */
        selectWorkspaceFolder: async () => {
          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          const { path } = await coordinatorClient.selectWorkspaceFolder();
          return path;
        },

        /**
         * Close the current workspace
         */
        closeWorkspace: () => {
          set(initialState);
        },

        /**
         * Open a file
         */
        openFile: (filePath: string, content: string) => {
          const { metadata, openFiles, tabs } = get();

          if (!metadata) {
            return;
          }

          const existingFile = openFiles.get(filePath);
          if (existingFile) {
            const existingTab = tabs.find((t) => t.filePath === filePath);
            if (!existingTab) {
              get().addTab(filePath, false);
            }
            set({ currentFile: filePath });
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

          const existingTab = tabs.find((t) => t.filePath === filePath);
          if (!existingTab) {
            get().addTab(filePath, false);
          }

          set({
            openFiles: newOpenFiles,
            currentFile: filePath,
          });
        },

        /**
         * Close a file
         */
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

        /**
         * Update file content (user is editing)
         */
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
        },

        /**
         * Mark file as dirty (has unsaved changes)
         */
        markFileDirty: (filePath: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);

          if (!file) return;

          const updatedFile: FileState = {
            ...file,
            isDirty: file.content !== file.savedContent,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);

          set({ openFiles: newOpenFiles });
        },

        /**
         * Mark file as saved
         */
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
         * Set current active file
         */
        setCurrentFile: (filePath: string | null) => {
          set({ currentFile: filePath });
        },

        /**
         * Add a new tab
         */
        addTab: (filePath: string, isPreview: boolean = false) => {
          const { tabs } = get();

          if (isPreview) {
            const previewTabIndex = tabs.findIndex((t) => t.isPreview);
            if (previewTabIndex !== -1) {
              const newTabs = [...tabs];
              newTabs[previewTabIndex] = {
                ...newTabs[previewTabIndex],
                filePath,
              };
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

        /**
         * Remove a tab
         */
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

        /**
         * Set active tab
         */
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

        /**
         * Pin/unpin a tab
         */
        pinTab: (tabId: string) => {
          const { tabs } = get();
          const newTabs = tabs.map((t) =>
            t.id === tabId ? { ...t, isPinned: !t.isPinned } : t
          );
          set({ tabs: newTabs });
        },

        /**
         * Convert preview tab to permanent tab
         */
        convertPreviewTab: (filePath: string) => {
          const { tabs } = get();
          const newTabs = tabs.map((t) =>
            t.filePath === filePath ? { ...t, isPreview: false } : t
          );
          set({ tabs: newTabs });
        },

        /**
         * Add project to recent history
         */
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

        /**
         * Update user preferences
         */
        updatePreferences: (preferences: Partial<WorkspacePreferences>) => {
          set((state) => ({
            preferences: {
              ...state.preferences,
              ...preferences,
            },
          }));
        },

        /**
         * Set error message
         */
        setError: (error: string | null) => {
          set({ error });
        },

        /**
         * Set loading state
         */
        setLoading: (isLoading: boolean) => {
          set({ isLoading });
        },

        /**
         * Set the full recursive file tree
         */
        setFileTree: (tree: FileTreeNode[]) => {
          set({ fileTree: tree });
        },

        /**
         * Reset to initial state
         */
        reset: () => {
          set(initialState);
        },
      }),
      {
        name: 'cushion-workspace',
        // Only persist certain fields
        partialize: (state) => ({
          recentProjects: state.recentProjects,
          preferences: state.preferences,
        }),
      }
    )
  )
);
