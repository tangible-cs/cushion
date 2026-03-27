import { create } from 'zustand';
import type { FileTreeNode } from '@cushion/types';

interface ExplorerStore {
  // Selection
  selectedPaths: Set<string>;
  lastSelectedPath: string | null;

  // Focus & rename
  focusedPath: string | null;
  focusedType: 'file' | 'directory' | null;
  renamingPath: string | null;

  // Context menu (rendered at root, triggered from any level)
  contextMenu: { path: string; name: string; type: 'file' | 'directory'; position: { x: number; y: number } } | null;

  // Clipboard
  clipboard: { paths: string[]; operation: 'cut' | 'copy' } | null;

  // Tree expansion
  expandedDirs: Set<string>;

  // Directory contents (centralized for flattening)
  dirContents: Map<string, FileTreeNode[]>;
  loadingDirs: Set<string>;

  // Creation
  creatingFileInDir: string | null;
  creatingFolderInDir: string | null;

  // Sidebar visibility
  sidebarCollapsed: boolean;

  // Reveal (set externally to scroll-to + highlight a path)
  revealPath: string | null;

  // Actions
  selectOnly: (path: string) => void;
  toggleSelect: (path: string) => void;
  selectRange: (path: string, flatOrder: string[]) => void;
  clearSelection: () => void;
  setFocused: (path: string, type: 'file' | 'directory') => void;
  clearFocused: () => void;
  setRenamingPath: (path: string | null) => void;
  setContextMenu: (menu: { path: string; name: string; type: 'file' | 'directory'; position: { x: number; y: number } } | null) => void;
  cut: () => void;
  copy: () => void;
  clearClipboard: () => void;
  expandDir: (path: string) => void;
  collapseDir: (path: string) => void;
  setDirContents: (path: string, nodes: FileTreeNode[]) => void;
  clearDirContents: () => void;
  setLoadingDir: (path: string, loading: boolean) => void;
  setCreatingFileInDir: (dir: string | null) => void;
  setCreatingFolderInDir: (dir: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  revealInExplorer: (path: string) => void;
  clearRevealPath: () => void;
  resetExplorerState: () => void;
}

export const useExplorerStore = create<ExplorerStore>()((set, get) => ({
  selectedPaths: new Set(),
  lastSelectedPath: null,
  focusedPath: null,
  focusedType: null,
  renamingPath: null,
  contextMenu: null,
  clipboard: null,
  expandedDirs: new Set(),
  dirContents: new Map(),
  loadingDirs: new Set(),
  creatingFileInDir: null,
  creatingFolderInDir: null,
  sidebarCollapsed: false,
  revealPath: null,

  selectOnly: (path) => {
    set({ selectedPaths: new Set([path]), lastSelectedPath: path });
  },

  toggleSelect: (path) => {
    const { selectedPaths } = get();
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ selectedPaths: next, lastSelectedPath: path });
  },

  selectRange: (targetPath, flatOrder) => {
    const { lastSelectedPath, selectedPaths } = get();
    const anchor = lastSelectedPath ?? targetPath;

    const anchorIdx = flatOrder.indexOf(anchor);
    const targetIdx = flatOrder.indexOf(targetPath);

    if (anchorIdx === -1 || targetIdx === -1) {
      set({ selectedPaths: new Set([targetPath]), lastSelectedPath: targetPath });
      return;
    }

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const range = new Set(flatOrder.slice(start, end + 1));

    // Merge with existing selection
    for (const p of selectedPaths) range.add(p);

    // Don't update lastSelectedPath — anchor stays for further shift-clicks
    set({ selectedPaths: range });
  },

  clearSelection: () => {
    set({ selectedPaths: new Set(), lastSelectedPath: null });
  },

  setFocused: (path, type) => {
    set({ focusedPath: path, focusedType: type });
  },

  clearFocused: () => {
    set({ focusedPath: null, focusedType: null });
  },

  setRenamingPath: (path) => {
    set({ renamingPath: path });
  },

  setContextMenu: (menu) => {
    set({ contextMenu: menu });
  },

  cut: () => {
    const { selectedPaths } = get();
    if (selectedPaths.size === 0) return;
    set({ clipboard: { paths: [...selectedPaths], operation: 'cut' } });
  },

  copy: () => {
    const { selectedPaths } = get();
    if (selectedPaths.size === 0) return;
    set({ clipboard: { paths: [...selectedPaths], operation: 'copy' } });
  },

  clearClipboard: () => {
    set({ clipboard: null });
  },

  expandDir: (path) => {
    const next = new Set(get().expandedDirs);
    next.add(path);
    set({ expandedDirs: next });
  },

  collapseDir: (path) => {
    const next = new Set(get().expandedDirs);
    next.delete(path);
    set({ expandedDirs: next });
  },

  setDirContents: (path, nodes) => {
    const next = new Map(get().dirContents);
    next.set(path, nodes);
    set({ dirContents: next });
  },

  clearDirContents: () => {
    set({ dirContents: new Map(), loadingDirs: new Set() });
  },

  setLoadingDir: (path, loading) => {
    const next = new Set(get().loadingDirs);
    if (loading) next.add(path); else next.delete(path);
    set({ loadingDirs: next });
  },

  setCreatingFileInDir: (dir) => {
    set(dir ? { creatingFileInDir: dir, creatingFolderInDir: null } : { creatingFileInDir: null });
  },

  setCreatingFolderInDir: (dir) => {
    set(dir ? { creatingFolderInDir: dir, creatingFileInDir: null } : { creatingFolderInDir: null });
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
  },

  revealInExplorer: (path) => {
    // Expand all ancestor directories so the target becomes visible
    const parts = path.split('/');
    const next = new Set(get().expandedDirs);
    for (let i = 1; i <= parts.length; i++) {
      next.add(parts.slice(0, i).join('/'));
    }
    set({
      sidebarCollapsed: false,
      expandedDirs: next,
      revealPath: path,
      selectedPaths: new Set([path]),
      lastSelectedPath: path,
      focusedPath: path,
      focusedType: 'directory',
    });
  },

  clearRevealPath: () => {
    set({ revealPath: null });
  },

  resetExplorerState: () => {
    set({
      expandedDirs: new Set(),
      dirContents: new Map(),
      loadingDirs: new Set(),
      selectedPaths: new Set(),
      lastSelectedPath: null,
      focusedPath: null,
      focusedType: null,
      renamingPath: null,
      contextMenu: null,
      clipboard: null,
      creatingFileInDir: null,
      creatingFolderInDir: null,
      sidebarCollapsed: false,
      revealPath: null,
    });
  },
}));
