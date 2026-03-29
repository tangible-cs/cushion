
import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, type ElementRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useExplorerStore } from '@/stores/explorerStore';
import { FileTree } from './FileTree';
import { MoveToDialog } from './MoveToDialog';
import { DeleteSystemTrashDialog } from './DeleteSystemTrashDialog';
import { FilePlus, FolderPlus, Search, Settings, ChevronDown, Trash2, AudioLines } from 'lucide-react';
import { useDictationStore } from '@/stores/dictationStore';
import { useMediaQuery } from 'usehooks-ts';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { LogoSpinner } from '@/components/ui/LogoSpinner';
import { BINARY_FILE_EXTENSIONS } from '@/lib/binary-extensions';
import { resolveConflict } from '@/lib/conflict-resolution';
import { useToast } from '@/components/chat/Toast';
import { cn } from '@/lib/utils';
import type { FileTreeNode } from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.csv', '.canvas', '.json', '.xml', '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log', '.sh', '.bat', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.excalidraw']);

function isTextFile(name: string): boolean {
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx < 0) return true; // No extension → treat as text
  return TEXT_EXTENSIONS.has(name.slice(dotIdx).toLowerCase());
}

interface FileBrowserProps {
  client: CoordinatorClient | null;
  onFileOpen: (path: string, content: string, forceNewTab?: boolean) => void;
  onSidebarToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  onSearch?: () => void;
  onSettings?: () => void;
  onTrash?: () => void;
}

export interface FileBrowserHandle {
  refreshFileList: () => Promise<void>;
  refreshDirectories: (affectedDirs: Set<string>) => void;
}

export const FileBrowser = forwardRef<FileBrowserHandle, FileBrowserProps>(
  function FileBrowser({ client, onFileOpen, onSidebarToggle, isCollapsed = false, onSearch, onSettings, onTrash }, ref) {
  const { metadata, currentFile, preferences, sidebarWidth: rawSidebarWidth, setSidebarWidth } = useWorkspaceStore();
  const { showToast } = useToast();
  const [rootFiles, setRootFiles] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootExpanded, setRootExpanded] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSourcePath, setMoveSourcePath] = useState<string>('');
  const [creatingFileAtRoot, setCreatingFileAtRoot] = useState(0);
  const [creatingFolderAtRoot, setCreatingFolderAtRoot] = useState(0);
  const [pendingDeletePaths, setPendingDeletePaths] = useState<string[] | null>(null);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const sidebarRef = useRef<ElementRef<"aside">>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarMin = 200;
  const sidebarMax = typeof window !== 'undefined'
    ? Math.max(sidebarMin, Math.floor(window.innerWidth * 0.45))
    : 520;
  const resolvedSidebarWidth = Math.min(sidebarMax, Math.max(sidebarMin, rawSidebarWidth));

  useEffect(() => {
    if (resolvedSidebarWidth === rawSidebarWidth) return;
    setSidebarWidth(resolvedSidebarWidth);
  }, [rawSidebarWidth, resolvedSidebarWidth, setSidebarWidth]);

  const loadDirectory = useCallback(async (relativePath: string): Promise<FileTreeNode[]> => {
    if (!client) {
      return [];
    }

    const isRoot = relativePath === '.';

    try {
      if (isRoot) {
        setIsLoading(true);
        setError(null);
      }

      const { files } = await client.listFiles(relativePath);

      if (isRoot) {
        setRootFiles(files);
      }

      return files;
    } catch (err) {
      if (isRoot) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load directory';
        setError(errorMsg);
      }
      console.error('[FileBrowser] Error loading directory:', err);
      return [];
    } finally {
      if (isRoot) {
        setIsLoading(false);
      }
    }
  }, [client]);

  const collapseSidebar = useCallback(() => {
    onSidebarToggle?.(true);
  }, [onSidebarToggle]);

  const resetWidth = useCallback(() => {
    onSidebarToggle?.(false);
  }, [onSidebarToggle]);

  const handleSidebarResize = useCallback(
    (nextWidth: number) => {
      setSidebarWidth(nextWidth);
    },
    [setSidebarWidth]
  );

  useEffect(() => {
    if (isMobile) {
      collapseSidebar();
    } else {
      resetWidth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]); // Only depend on isMobile, not the functions

  useEffect(() => {
    useExplorerStore.getState().resetExplorerState();
  }, [metadata?.projectPath]);

  useEffect(() => {
    if (metadata && client) {
      loadDirectory('.');
    }
  }, [metadata?.projectPath, client, loadDirectory]);

  useImperativeHandle(ref, () => ({
    refreshFileList: async () => {
      await loadDirectory('.');
    },
    refreshDirectories: (affectedDirs: Set<string>) => {
      if (affectedDirs.has('.')) {
        loadDirectory('.');
      }
      const { expandedDirs, setDirContents } = useExplorerStore.getState();
      for (const dir of affectedDirs) {
        if (dir !== '.' && expandedDirs.has(dir)) {
          loadDirectory(dir).then((nodes) => {
            if (nodes.length > 0 || expandedDirs.has(dir)) {
              setDirContents(dir, nodes);
            }
          });
        }
      }
    },
  }), [loadDirectory]);

  const handleFileClick = async (filePath: string, forceNewTab?: boolean) => {
    if (!client) {
      return;
    }

    if (BINARY_FILE_EXTENSIONS.test(filePath)) {
      onFileOpen(filePath, '', forceNewTab);
      return;
    }

    if (useWorkspaceStore.getState().openFiles.has(filePath)) {
      onFileOpen(filePath, '', forceNewTab);
      return;
    }

    try {
      const { content } = await client.readFile(filePath);
      onFileOpen(filePath, content, forceNewTab);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to open file';
      setError(errorMsg);
      console.error('[FileBrowser] Error opening file:', err);
    }
  };

  const handlePaste = useCallback(async (destinationDir: string) => {
    if (!client) return;
    const { clipboard, clearClipboard } = useExplorerStore.getState();
    if (!clipboard) return;

    try {
      const dirsToRefresh = new Set<string>();
      dirsToRefresh.add(destinationDir === '.' ? '.' : destinationDir);

      for (const srcPath of clipboard.paths) {
        const name = srcPath.split('/').pop() || srcPath;
        const rawDest = destinationDir === '.' ? name : `${destinationDir}/${name}`;
        const dest = await resolveConflict(client, rawDest);

        if (clipboard.operation === 'cut') {
          await client.renameFile(srcPath, dest);
          const store = useWorkspaceStore.getState();
          const fileState = store.openFiles.get(srcPath);
          if (fileState) {
            const wasActive = store.currentFile === srcPath;
            store.closeFile(srcPath);
            store.openFile(dest, fileState.content);
            if (wasActive) store.setCurrentFile(dest);
          }
          const srcParent = srcPath.substring(0, srcPath.lastIndexOf('/')) || '.';
          dirsToRefresh.add(srcParent);
        } else {
          await client.duplicateFile(srcPath, dest);
        }
      }

      if (clipboard.operation === 'cut') {
        clearClipboard();
      }

      for (const dir of dirsToRefresh) {
        await loadDirectory(dir);
      }
    } catch (error) {
      console.error('[FileBrowser] Failed to paste:', error);
      setError(`Failed to paste: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [client, loadDirectory]);

  const handleExternalDrop = useCallback(async (files: FileList, targetDir: string) => {
    if (!client) return;
    if (!window.electronAPI) return; // Electron-only

    const allowedExts = new Set(preferences.allowedExtensions.map((e: string) => e.toLowerCase()));
    const dirsToRefresh = new Set<string>();
    dirsToRefresh.add(targetDir === '.' ? '.' : targetDir);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dotIdx = file.name.lastIndexOf('.');
      const ext = dotIdx > 0 ? file.name.slice(dotIdx).toLowerCase() : '';

      if (ext && !allowedExts.has(ext)) {
        showToast({ description: `Unsupported: ${file.name} — change in Settings > Files`, variant: 'error' });
        continue;
      }

      const rawDest = targetDir === '.' ? file.name : `${targetDir}/${file.name}`;
      const dest = await resolveConflict(client, rawDest);

      if (isTextFile(file.name)) {
        const text = await file.text();
        await client.saveFile(dest, text);
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let j = 0; j < bytes.length; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
        const base64 = btoa(binary);
        await client.saveFileBase64(dest, base64);
      }
    }

    for (const dir of dirsToRefresh) {
      await loadDirectory(dir);
    }
  }, [client, preferences.allowedExtensions, loadDirectory, showToast]);

  useEffect(() => {
    if (!metadata && onSidebarToggle) {
      onSidebarToggle(true);
    } else if (metadata && onSidebarToggle && !isCollapsed) {
      onSidebarToggle(false);
    }
  }, [metadata, onSidebarToggle, isCollapsed]);

  const handleSoftDelete = useCallback(async (paths: string[]) => {
    if (!client) return;

    try {
      const trashItems: { id: string; path: string }[] = [];
      const dirsToRefresh = new Set<string>();

      for (const p of paths) {
        const result = await client.deleteFile(p);
        if (result.trashItem) {
          trashItems.push({ id: result.trashItem.id, path: p });
        }
        const parentPath = p.substring(0, p.lastIndexOf('/')) || '.';
        dirsToRefresh.add(parentPath);
      }

      for (const dir of dirsToRefresh) {
        await loadDirectory(dir);
      }
      useExplorerStore.getState().clearSelection();

      if (trashItems.length > 0) {
        const fileName = trashItems[0].path.split('/').pop() || trashItems[0].path;
        const description = trashItems.length === 1
          ? `"${fileName}" moved to trash`
          : `${trashItems.length} items moved to trash`;

        const trashItemIds = trashItems.map((t) => t.id);

        showToast({
          variant: 'error',
          description,
          duration: 8000,
          actions: [{
            label: 'Undo',
            onClick: async () => {
              await client.restoreFromTrash(trashItemIds);
              for (const dir of dirsToRefresh) {
                await loadDirectory(dir);
              }
            },
          }],
        });
      }
    } catch (error) {
      console.error('[FileBrowser] Failed to delete:', error);
      setError(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [client, loadDirectory, showToast]);

  if (!metadata) {
    return null;
  }

  const RAIL_WIDTH = 48;

  const sidebarBtnClass = cn(
    "w-full flex items-center gap-3 px-2 h-8 rounded-md",
    "text-sm text-muted-foreground hover:text-foreground",
    "hover:bg-muted/30",
    "transition-colors duration-150"
  );

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "group/sidebar h-full flex-shrink-0 flex flex-col relative",
          "transition-[width,background-color] duration-300 ease-in-out",
          "border-r border-border overflow-hidden",
          isCollapsed ? "bg-background" : "bg-sidebar-bg"
        )}
        style={{ width: isCollapsed ? RAIL_WIDTH : resolvedSidebarWidth }}
      >
        {!isCollapsed && !isMobile && (
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={resolvedSidebarWidth}
            min={sidebarMin}
            max={sidebarMax}
            collapseThreshold={Math.max(0, sidebarMin - 40)}
            onResize={handleSidebarResize}
            onCollapse={collapseSidebar}
          />
        )}

        {/* Top buttons — icons stay at same position, text clipped when collapsed */}
        <div className="flex-shrink-0 px-2 pt-2 pb-1 space-y-0.5">
          <button onClick={onSearch} className={sidebarBtnClass} title="Search">
            <Search size={16} className="flex-shrink-0" />
            <span className="truncate whitespace-nowrap">Search</span>
          </button>
          <button onClick={() => { if (isCollapsed) onSidebarToggle?.(false); setCreatingFileAtRoot(c => c + 1); }} className={sidebarBtnClass} title="New file">
            <FilePlus size={16} className="flex-shrink-0" />
            <span className="truncate whitespace-nowrap">New file</span>
          </button>
          <button onClick={() => { if (isCollapsed) onSidebarToggle?.(false); setCreatingFolderAtRoot(c => c + 1); }} className={sidebarBtnClass} title="New folder">
            <FolderPlus size={16} className="flex-shrink-0" />
            <span className="truncate whitespace-nowrap">New folder</span>
          </button>
          <button onClick={() => useDictationStore.getState().toggleRecording()} className={sidebarBtnClass} title="Whisper">
            <AudioLines size={16} className="flex-shrink-0" />
            <span className="truncate whitespace-nowrap">Whisper</span>
          </button>
        </div>

        {/* File tree — only when expanded */}
        {!isCollapsed && (
          <>
            <div className="flex-shrink-0 h-2" />

            <div className="flex-shrink-0 px-2">
              <button
                onClick={() => setRootExpanded(!rootExpanded)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-1 h-[26px] rounded text-xs font-semibold uppercase tracking-wide",
                  "text-muted-foreground hover:text-foreground",
                  "hover:bg-muted/30",
                  "transition-colors duration-150"
                )}
              >
                <ChevronDown
                  size={12}
                  className={cn(
                    "transition-transform duration-150 flex-shrink-0",
                    !rootExpanded && "-rotate-90"
                  )}
                />
                <span className="truncate">{metadata.projectName}</span>
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden px-2 thin-scrollbar"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  useExplorerStore.getState().clearSelection();
                  useExplorerStore.getState().clearFocused();
                }
              }}
              onContextMenu={(e) => {
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  const store = useExplorerStore.getState();
                  store.clearSelection();
                  store.clearFocused();
                  store.setContextMenu({ path: '__root__', name: '', type: 'directory', position: { x: e.clientX, y: e.clientY } });
                }
              }}
            >
              {rootExpanded && (
                isLoading && rootFiles.length === 0 ? (
                <div className="flex items-center justify-center p-6">
                  <LogoSpinner size={40} />
                </div>
              ) : error ? (
                <div
                  className="p-4 m-2 rounded-md text-sm"
                  style={{
                    backgroundColor: 'var(--accent-red-12)',
                    border: '1px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                  }}
                >
                  <div>{error}</div>
                  <button
                    onClick={() => loadDirectory('.')}
                    className="mt-2 px-3 py-1 rounded text-xs transition-colors hover:bg-[var(--overlay-10)]"
                    style={{
                      backgroundColor: 'transparent',
                      border: '1px solid var(--accent-red)',
                      color: 'var(--accent-red)',
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <FileTree
                  nodes={rootFiles}
                  onFileClick={handleFileClick}
                  currentFile={currentFile}
                  scrollRef={scrollRef}
                  onLoadDirectory={loadDirectory}

                  onPaste={handlePaste}
                  onExternalDrop={handleExternalDrop}
                  creatingFileAtRoot={creatingFileAtRoot}
                  creatingFolderAtRoot={creatingFolderAtRoot}
                  onRootCreationDone={() => {
                    setCreatingFileAtRoot(0);
                    setCreatingFolderAtRoot(0);
                  }}
                  onAddFile={async (filePath) => {
                    if (!client) return;

                    try {
                      const resolved = await resolveConflict(client, filePath);
                      await client.saveFile(resolved, '');
                      const parentPath = resolved.substring(0, resolved.lastIndexOf('/')) || '.';
                      await loadDirectory(parentPath);
                      return resolved;
                    } catch (error) {
                      console.error('[FileBrowser] Failed to create file:', error);
                      setError(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  onAddFolder={async (folderPath) => {
                    if (!client) return;

                    try {
                      const resolved = await resolveConflict(client, folderPath);
                      await client.createFolder(resolved);
                      const parentPath = resolved.substring(0, resolved.lastIndexOf('/')) || '.';
                      await loadDirectory(parentPath);
                      return resolved;
                    } catch (error) {
                      console.error('[FileBrowser] Failed to create folder:', error);
                      setError(`Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  onRename={async (oldPath, newPath) => {
                    if (!client) return;

                    try {
                      const resolved = await resolveConflict(client, newPath);
                      await client.renameFile(oldPath, resolved);

                      const store = useWorkspaceStore.getState();
                      const fileState = store.openFiles.get(oldPath);
                      if (fileState) {
                        const wasActive = store.currentFile === oldPath;
                        store.closeFile(oldPath);
                        store.openFile(resolved, fileState.content);
                        if (wasActive) {
                          store.setCurrentFile(resolved);
                        }
                      }

                      const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/')) || '.';
                      await loadDirectory(parentPath);
                      const destParent = resolved.substring(0, resolved.lastIndexOf('/')) || '.';
                      if (destParent !== parentPath) {
                        await loadDirectory(destParent);
                      }
                    } catch (error) {
                      console.error('[FileBrowser] Failed to rename:', error);
                      setError(`Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  onDelete={(path) => {
                    if (preferences.trashMethod === 'system' && preferences.confirmSystemTrash) {
                      setPendingDeletePaths([path]);
                    } else {
                      handleSoftDelete([path]);
                    }
                  }}
                  onDeleteMultiple={(paths) => {
                    if (preferences.trashMethod === 'system' && preferences.confirmSystemTrash) {
                      setPendingDeletePaths(paths);
                    } else {
                      handleSoftDelete(paths);
                    }
                  }}
                  onDuplicate={async (path) => {
                    if (!client) return;

                    try {
                      const newPath = await resolveConflict(client, path);

                      await client.duplicateFile(path, newPath);
                      const parentPath = path.substring(0, path.lastIndexOf('/')) || '.';
                      await loadDirectory(parentPath);
                    } catch (error) {
                      console.error('[FileBrowser] Failed to duplicate:', error);
                      setError(`Failed to duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                  }}
                  onMoveTo={(path) => {
                    setMoveSourcePath(path);
                    setMoveDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Spacer when collapsed to push bottom buttons down */}
        {isCollapsed && <div className="flex-1" />}

        {/* Bottom bar — Settings & Trash */}
        <div className={cn(
          "flex-shrink-0 px-2 py-1.5",
          isCollapsed ? "space-y-0.5" : "flex items-center justify-end gap-1 border-t border-border"
        )}>
          <button onClick={onSettings} className={isCollapsed ? sidebarBtnClass : "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors duration-150"} title="Settings">
            <Settings size={16} className="flex-shrink-0" />
            {isCollapsed && <span className="truncate whitespace-nowrap">Settings</span>}
          </button>
          <button onClick={onTrash} className={isCollapsed ? sidebarBtnClass : "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors duration-150"} title="Trash">
            <Trash2 size={16} className="flex-shrink-0" />
            {isCollapsed && <span className="truncate whitespace-nowrap">Trash</span>}
          </button>
        </div>
      </aside>

    <MoveToDialog
      isOpen={moveDialogOpen}
      onClose={() => setMoveDialogOpen(false)}
      currentPath={moveSourcePath}
      rootFiles={rootFiles}
      onLoadDirectory={loadDirectory}
      onMove={async (targetPath) => {
        if (!client) return;

        try {
          const fileName = moveSourcePath.split('/').pop() || moveSourcePath;
          const rawPath = targetPath === '.' ? fileName : `${targetPath}/${fileName}`;
          const newPath = await resolveConflict(client, rawPath);

          await client.renameFile(moveSourcePath, newPath);
          const sourceParentPath = moveSourcePath.substring(0, moveSourcePath.lastIndexOf('/')) || '.';
          await loadDirectory(sourceParentPath);
          if (targetPath !== sourceParentPath) {
            await loadDirectory(targetPath);
          }
        } catch (error) {
          console.error('[FileBrowser] Failed to move:', error);
          setError(`Failed to move: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }}
    />

    <DeleteSystemTrashDialog
      paths={pendingDeletePaths}
      onClose={() => setPendingDeletePaths(null)}
      onConfirm={(dontAskAgain) => {
        if (pendingDeletePaths) handleSoftDelete(pendingDeletePaths);
        if (dontAskAgain) {
          useWorkspaceStore.getState().updatePreferences({ confirmSystemTrash: false });
        }
        setPendingDeletePaths(null);
      }}
    />

    </>
  );
  }
);
