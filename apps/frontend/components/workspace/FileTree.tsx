
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FileTreeNode } from '@cushion/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { buildMenuItems } from './FileTreeItemActions';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { FilePlus, FolderPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useExplorerStore } from '@/stores/explorerStore';
import { FolderIcon, FileIcon } from '@/components/shared/FileIcons';
import { FileTreeRow } from './FileTreeRow';
import { flattenVisibleTree, flatPathsFromRows, type FlatRow } from './flattenTree';

interface FileTreeProps {
  nodes: FileTreeNode[];
  onFileClick: (path: string, forceNewTab?: boolean) => void;
  currentFile: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onLoadDirectory?: (path: string) => Promise<FileTreeNode[]>;
  onAddFile?: (filePath: string) => Promise<string | void>;
  onAddFolder?: (folderPath: string) => Promise<string | void>;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onDeleteMultiple?: (paths: string[]) => void;
  onDuplicate?: (path: string) => void;
  onMoveTo?: (path: string) => void;
  onPaste?: (destinationDir: string) => void;
  onExternalDrop?: (files: FileList, targetDir: string) => void;
  creatingFileAtRoot?: number;
  creatingFolderAtRoot?: number;
  onRootCreationDone?: () => void;
}

function CreationInput({ icon, value, onChange, onSubmit, onCancel, placeholder, indent }: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder: string;
  indent: number;
}) {
  return (
    <div className="flex items-center min-h-[30px] px-1.5" style={{ paddingLeft: `${indent}px` }}>
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
        {icon}
      </div>
      <input
        className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onSubmit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') onSubmit();
          else if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function FileTree({
  nodes,
  onFileClick,
  currentFile,
  scrollRef,
  onLoadDirectory,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onDeleteMultiple,
  onDuplicate,
  onMoveTo,
  onPaste,
  onExternalDrop,
  creatingFileAtRoot,
  creatingFolderAtRoot,
  onRootCreationDone,
}: FileTreeProps) {
  const showCushionFiles = useWorkspaceStore((s) => s.preferences.showCushionFiles);

  const expandedDirs = useExplorerStore((s) => s.expandedDirs);
  const dirContents = useExplorerStore((s) => s.dirContents);
  const { expandDir, collapseDir, setDirContents, setLoadingDir } = useExplorerStore();
  const [renameValue, setRenameValue] = useState('');
  const creatingFileInDir = useExplorerStore((s) => s.creatingFileInDir);
  const creatingFolderInDir = useExplorerStore((s) => s.creatingFolderInDir);
  const { setCreatingFileInDir, setCreatingFolderInDir } = useExplorerStore();
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [dragOverDir, setDragOverDir] = useState<string | null>(null);
  const dragActiveRef = useRef(false);
  const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoExpandTarget = useRef<string | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const selectedPaths = useExplorerStore((s) => s.selectedPaths);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const focusedPath = useExplorerStore((s) => s.focusedPath);
  const focusedType = useExplorerStore((s) => s.focusedType);
  const renamingPath = useExplorerStore((s) => s.renamingPath);
  const contextMenu = useExplorerStore((s) => s.contextMenu);
  const { selectOnly, toggleSelect, selectRange, clearSelection, cut, copy, clearClipboard, setFocused, clearFocused, setRenamingPath, setContextMenu } = useExplorerStore();

  const flatRows = useMemo(
    () => flattenVisibleTree(nodes, expandedDirs, dirContents, showCushionFiles, creatingFileInDir, creatingFolderInDir),
    [nodes, expandedDirs, dirContents, showCushionFiles, creatingFileInDir, creatingFolderInDir]
  );

  const flatOrder = useMemo(() => flatPathsFromRows(flatRows), [flatRows]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    getItemKey: (i) => {
      const row = flatRows[i];
      return row.kind === 'item' ? row.path : `__create_${row.kind}_${row.parentPath}`;
    },
    overscan: 10,
  });

  const prevNodesRef = useRef<FileTreeNode[] | null>(null);
  useEffect(() => {
    if (prevNodesRef.current === nodes) return;
    prevNodesRef.current = nodes;

    if (!onLoadDirectory) return;
    const currentExpanded = useExplorerStore.getState().expandedDirs;
    const filtered = showCushionFiles ? nodes : nodes.filter((n) => n.name !== '.cushion');
    for (const node of filtered) {
      if (node.type === 'directory' && currentExpanded.has(node.path)) {
        onLoadDirectory(node.path)
          .then((contents) => setDirContents(node.path, contents))
          .catch(() => {});
      }
    }
  }, [nodes]);

  useEffect(() => {
    if (creatingFileAtRoot && creatingFileAtRoot > 0) {
      setCreatingFolderInDir(null);
      setCreatingFileInDir('__root__');
      setNewFileName('');
    }
  }, [creatingFileAtRoot]);

  useEffect(() => {
    if (creatingFolderAtRoot && creatingFolderAtRoot > 0) {
      setCreatingFileInDir(null);
      setCreatingFolderInDir('__root__');
      setNewFolderName('');
    }
  }, [creatingFolderAtRoot]);

  const toggleDirectory = useCallback(async (path: string) => {
    const currentExpanded = useExplorerStore.getState().expandedDirs;
    const isExpanded = currentExpanded.has(path);

    if (isExpanded) {
      collapseDir(path);
    } else {
      const contents = useExplorerStore.getState().dirContents;
      if (!contents.has(path) && onLoadDirectory) {
        setLoadingDir(path, true);
        try {
          const result = await onLoadDirectory(path);
          setDirContents(path, result);
        } catch (error) {
          console.error(`Failed to load directory ${path}:`, error);
        } finally {
          setLoadingDir(path, false);
        }
      }
      expandDir(path);
    }
  }, [onLoadDirectory, expandDir, collapseDir, setDirContents, setLoadingDir]);

  const refreshDir = useCallback(async (dirPath: string) => {
    if (onLoadDirectory && dirPath !== '.' && dirPath !== '__root__') {
      const contents = await onLoadDirectory(dirPath);
      setDirContents(dirPath, contents);
    }
  }, [onLoadDirectory, setDirContents]);

  const handleStartRename = useCallback((node: FileTreeNode) => {
    setRenamingPath(node.path);
    const name = node.name;
    setRenameValue(name.endsWith('.md') ? name.slice(0, -3) : name);
  }, [setRenamingPath]);

  const handleRenameSubmit = useCallback(async (node: FileTreeNode) => {
    if (renamingPath !== node.path) return;
    const name = node.name;
    const hadMdExt = name.endsWith('.md');
    const baseName = hadMdExt ? name.slice(0, -3) : name;
    setRenamingPath(null);

    if (!renameValue.trim() || renameValue === baseName) return;

    if (onRename) {
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
      const newName = hadMdExt ? `${renameValue}.md` : renameValue;
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;
      onRename(node.path, newPath);
    }
  }, [renamingPath, renameValue, onRename, setRenamingPath]);

  const handleRenameCancel = useCallback(() => {
    setRenamingPath(null);
    setRenameValue('');
  }, [setRenamingPath]);

  const isRootPath = (p: string) => p === '.' || p === '__root__';

  const prepareCreate = useCallback((parentPath: string) => {
    if (!useExplorerStore.getState().expandedDirs.has(parentPath)) toggleDirectory(parentPath);
    clearFocused();
  }, [toggleDirectory, clearFocused]);

  const finishCreate = useCallback(() => {
    setCreatingFileInDir(null);
    setCreatingFolderInDir(null);
    setNewFileName('');
    setNewFolderName('');
    onRootCreationDone?.();
  }, [setCreatingFileInDir, setCreatingFolderInDir, onRootCreationDone]);

  const handleStartCreateFile = useCallback((parentPath: string) => {
    prepareCreate(parentPath);
    setCreatingFolderInDir(null);
    setCreatingFileInDir(parentPath);
    setNewFileName('');
  }, [prepareCreate, setCreatingFileInDir, setCreatingFolderInDir]);

  const handleStartCreateFolder = useCallback((parentPath: string) => {
    prepareCreate(parentPath);
    setCreatingFileInDir(null);
    setCreatingFolderInDir(parentPath);
    setNewFolderName('');
  }, [prepareCreate, setCreatingFileInDir, setCreatingFolderInDir]);

  const handleCreateFileSubmit = useCallback(async (parentPath: string) => {
    if (creatingFileInDir === null) return;
    if (!newFileName.trim()) { finishCreate(); return; }

    setCreatingFileInDir(null);
    if (onAddFile) {
      const name = newFileName.includes('.') ? newFileName : `${newFileName}.md`;
      const newPath = isRootPath(parentPath) ? name : `${parentPath}/${name}`;
      const resolved = await onAddFile(newPath);
      if (!isRootPath(parentPath)) await refreshDir(parentPath);
      const createdPath = typeof resolved === 'string' ? resolved : newPath;
      selectOnly(createdPath);
      setFocused(createdPath, 'file');
      onFileClick(createdPath);
    }
    finishCreate();
  }, [creatingFileInDir, newFileName, onAddFile, onFileClick, refreshDir, selectOnly, setFocused, setCreatingFileInDir, finishCreate]);

  const handleCreateFolderSubmit = useCallback(async (parentPath: string) => {
    if (creatingFolderInDir === null) return;
    if (!newFolderName.trim()) { finishCreate(); return; }

    setCreatingFolderInDir(null);
    if (onAddFolder) {
      const newPath = isRootPath(parentPath) ? newFolderName : `${parentPath}/${newFolderName}`;
      const resolved = await onAddFolder(newPath);
      if (!isRootPath(parentPath)) await refreshDir(parentPath);
      const createdPath = typeof resolved === 'string' ? resolved : newPath;
      selectOnly(createdPath);
      setFocused(createdPath, 'directory');
    }
    finishCreate();
  }, [creatingFolderInDir, newFolderName, onAddFolder, refreshDir, selectOnly, setFocused, setCreatingFolderInDir, finishCreate]);

  const handleDragStart = useCallback((e: React.DragEvent, node: FileTreeNode) => {
    if (selectedPaths.has(node.path) && selectedPaths.size > 1) {
      e.dataTransfer.setData('application/x-cushion-paths', JSON.stringify([...selectedPaths]));
      e.dataTransfer.effectAllowed = 'move';
    } else {
      e.dataTransfer.setData('application/x-cushion-path', node.path);
      e.dataTransfer.setData('application/x-cushion-name', node.name);
      e.dataTransfer.effectAllowed = 'move';
    }
  }, [selectedPaths]);

  const handleDragEnd = useCallback(() => {
    dragActiveRef.current = false;
    setDragOverDir(null);
    if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
    lastAutoExpandTarget.current = null;
  }, []);

  const canDropOnFolder = useCallback((sourcePath: string, targetPath: string) => {
    if (sourcePath === targetPath) return false;
    const parentPath = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
    if (parentPath === targetPath || (!parentPath && targetPath === '__root__')) return false;
    if (targetPath.startsWith(sourcePath + '/')) return false;
    return true;
  }, []);

  const getDragTarget = useCallback((e: React.DragEvent): string => {
    const el = treeContainerRef.current;
    if (!el) return '__root__';
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rowIndex = Math.floor(y / 30);
    if (rowIndex < 0 || rowIndex >= flatRows.length) return '__root__';
    const row = flatRows[rowIndex];
    if (row.kind !== 'item') return '__root__';
    if (row.type === 'directory') return row.path;
    const slashIdx = row.path.lastIndexOf('/');
    return slashIdx > 0 ? row.path.slice(0, slashIdx) : '__root__';
  }, [flatRows]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasInternal = e.dataTransfer.types.includes('application/x-cushion-path') || e.dataTransfer.types.includes('application/x-cushion-paths');
    const hasExternal = e.dataTransfer.types.includes('Files');
    if (!hasInternal && !hasExternal) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasInternal ? 'move' : 'copy';

    const target = getDragTarget(e);
    setDragOverDir(target);

    if (target !== '__root__' && target !== lastAutoExpandTarget.current
      && !useExplorerStore.getState().expandedDirs.has(target)) {
      if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
      lastAutoExpandTarget.current = target;
      autoExpandTimer.current = setTimeout(() => {
        toggleDirectory(target);
      }, 500);
    } else if (target !== lastAutoExpandTarget.current) {
      if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
      lastAutoExpandTarget.current = target;
    }
  }, [getDragTarget, toggleDirectory]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    const hasInternal = e.dataTransfer.types.includes('application/x-cushion-path') || e.dataTransfer.types.includes('application/x-cushion-paths');
    const hasExternal = e.dataTransfer.types.includes('Files');
    if (!hasInternal && !hasExternal) return;
    e.preventDefault();
    dragActiveRef.current = true;
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      dragActiveRef.current = false;
      setDragOverDir(null);
      if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
      lastAutoExpandTarget.current = null;
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetPath = getDragTarget(e);
    setDragOverDir(null);
    dragActiveRef.current = false;
    if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
    lastAutoExpandTarget.current = null;

    const multiPaths = e.dataTransfer.getData('application/x-cushion-paths');
    if (multiPaths) {
      const paths: string[] = JSON.parse(multiPaths);
      for (const sourcePath of paths) {
        const name = sourcePath.split('/').pop() || sourcePath;
        if (!canDropOnFolder(sourcePath, targetPath)) continue;
        const isRoot = targetPath === '__root__';
        const newPath = isRoot ? name : `${targetPath}/${name}`;
        onRename?.(sourcePath, newPath);
      }
      return;
    }

    const sourcePath = e.dataTransfer.getData('application/x-cushion-path');
    const sourceName = e.dataTransfer.getData('application/x-cushion-name');
    if (sourcePath && sourceName) {
      if (!canDropOnFolder(sourcePath, targetPath)) return;
      const isRoot = targetPath === '__root__';
      const newPath = isRoot ? sourceName : `${targetPath}/${sourceName}`;
      onRename?.(sourcePath, newPath);
      return;
    }

    if (e.dataTransfer.files.length > 0 && onExternalDrop) {
      const destDir = targetPath === '__root__' ? '.' : targetPath;
      onExternalDrop(e.dataTransfer.files, destDir);
    }
  }, [onRename, onExternalDrop, canDropOnFolder, getDragTarget]);

  const prevRenamingRef = useRef<string | null>(null);
  useEffect(() => {
    if (renamingPath === prevRenamingRef.current) return;
    prevRenamingRef.current = renamingPath;
    if (!renamingPath) return;
    const row = flatRows.find((r) => r.kind === 'item' && r.path === renamingPath);
    if (row && row.kind === 'item') {
      const name = row.node.name;
      setRenameValue(name.endsWith('.md') ? name.slice(0, -3) : name);
    }
  }, [renamingPath, flatRows]);

  const menuCallbacksForNode = useCallback((path: string, name: string, type: 'file' | 'directory') => ({
    onAddFile: type === 'directory' ? () => handleStartCreateFile(path) : undefined,
    onAddFolder: type === 'directory' ? () => handleStartCreateFolder(path) : undefined,
    onRename: () => setRenamingPath(path),
    onDelete: onDelete ? (p: string) => onDelete(p) : undefined,
    onDeleteMultiple: onDeleteMultiple,
    onDuplicate: onDuplicate ? (p: string) => onDuplicate(p) : undefined,
    onMoveTo: onMoveTo ? (p: string) => onMoveTo(p) : undefined,
    onCut: () => cut(),
    onCopy: () => copy(),
    onPaste: onPaste,
  }), [onDelete, onDeleteMultiple, onDuplicate, onMoveTo, cut, copy, onPaste, setRenamingPath, handleStartCreateFile, handleStartCreateFolder]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedPaths.has(node.path)) {
      selectOnly(node.path);
    }
    setContextMenu({ path: node.path, name: node.name, type: node.type, position: { x: e.clientX, y: e.clientY } });
  }, [selectedPaths, selectOnly, setContextMenu]);

  const getPasteDestination = (): string => {
    if (!focusedPath) return '.';
    if (focusedType === 'directory') return focusedPath;
    const slashIdx = focusedPath.lastIndexOf('/');
    return slashIdx > 0 ? focusedPath.slice(0, slashIdx) : '.';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (renamingPath) return;

    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      if (selectedPaths.size > 0) { e.preventDefault(); copy(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      if (selectedPaths.size > 0) { e.preventDefault(); cut(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      if (clipboard) { e.preventDefault(); onPaste?.(getPasteDestination()); return; }
    }
    if (e.key === 'Escape') {
      e.preventDefault(); clearClipboard(); clearSelection(); return;
    }

    if (!focusedPath) return;

    if (e.key === 'F2') {
      e.preventDefault();
      setRenamingPath(focusedPath);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      if (selectedPaths.size > 1 && onDeleteMultiple) {
        onDeleteMultiple([...selectedPaths]);
      } else {
        onDelete?.(focusedPath);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedType === 'directory') {
        toggleDirectory(focusedPath);
      } else {
        onFileClick(focusedPath);
      }
    }
  };

  // Reveal path: load ancestor dirs and scroll into view
  const revealPath = useExplorerStore((s) => s.revealPath);
  const { clearRevealPath } = useExplorerStore();

  useEffect(() => {
    if (!revealPath || !onLoadDirectory) return;
    clearRevealPath();

    // Load contents for every ancestor directory that was just expanded
    const parts = revealPath.split('/');
    const loadAncestors = async () => {
      for (let i = 1; i <= parts.length; i++) {
        const dirPath = parts.slice(0, i).join('/');
        if (!useExplorerStore.getState().dirContents.has(dirPath)) {
          try {
            const contents = await onLoadDirectory(dirPath);
            setDirContents(dirPath, contents);
          } catch { /* ignore */ }
        }
      }
      // After loading, scroll to the target on the next frame
      requestAnimationFrame(() => {
        const rows = flattenVisibleTree(
          nodes,
          useExplorerStore.getState().expandedDirs,
          useExplorerStore.getState().dirContents,
          showCushionFiles,
          useExplorerStore.getState().creatingFileInDir,
          useExplorerStore.getState().creatingFolderInDir,
        );
        const idx = rows.findIndex((r) => r.kind === 'item' && r.path === revealPath);
        if (idx >= 0) {
          virtualizer.scrollToIndex(idx, { align: 'center' });
        }
      });
    };
    loadAncestors();
  }, [revealPath]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className={cn("text-sm select-none outline-none rounded transition-colors duration-150 min-h-full",
        dragOverDir === '__root__' && "ring-1 ring-inset ring-accent/40 bg-[var(--accent-primary-12)]"
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          clearSelection();
          clearFocused();
        }
      }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          clearSelection();
          clearFocused();
          setContextMenu({ path: '__root__', name: '', type: 'directory', position: { x: e.clientX, y: e.clientY } });
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={treeContainerRef}
        style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
      >
        {virtualItems.map((vi) => {
          const row = flatRows[vi.index];

          if (row.kind === 'create-file') {
            return (
              <div
                key={vi.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${vi.size}px`,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <CreationInput
                  icon={<FileIcon />}
                  value={newFileName}
                  onChange={setNewFileName}
                  onSubmit={() => handleCreateFileSubmit(row.parentPath)}
                  onCancel={finishCreate}
                  placeholder="filename.md"
                  indent={row.depth * 20 + 6}
                />
              </div>
            );
          }

          if (row.kind === 'create-folder') {
            return (
              <div
                key={vi.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${vi.size}px`,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <CreationInput
                  icon={<FolderIcon open={false} />}
                  value={newFolderName}
                  onChange={setNewFolderName}
                  onSubmit={() => handleCreateFolderSubmit(row.parentPath)}
                  onCancel={finishCreate}
                  placeholder="folder name"
                  indent={row.depth * 20 + 6}
                />
              </div>
            );
          }

          return (
            <div
              key={vi.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${vi.size}px`,
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <FileTreeRow
                item={row as import('./flattenTree').FlatTreeItem}
                currentFile={currentFile}
                onFileClick={onFileClick}
                onToggleDirectory={toggleDirectory}
                onStartRename={handleStartRename}
                onStartCreateFile={handleStartCreateFile}
                onStartCreateFolder={handleStartCreateFolder}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onContextMenu={handleContextMenu}
                flatOrder={flatOrder}
                dragOverDir={dragOverDir}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={handleRenameCancel}
              />
            </div>
          );
        })}
      </div>

      {contextMenu && (
        <ContextMenu
          items={contextMenu.path === '__root__'
            ? [
                { id: 'new-file', label: 'New file', icon: FilePlus, onClick: () => handleStartCreateFile('__root__') },
                { id: 'new-folder', label: 'New folder', icon: FolderPlus, onClick: () => handleStartCreateFolder('__root__') },
              ] satisfies ContextMenuItem[]
            : buildMenuItems(
                { path: contextMenu.path, name: contextMenu.name, type: contextMenu.type } as FileTreeNode,
                menuCallbacksForNode(contextMenu.path, contextMenu.name, contextMenu.type),
              )
          }
          isOpen={true}
          onClose={() => setContextMenu(null)}
          position={contextMenu.position}
        />
      )}
    </div>
  );
}
