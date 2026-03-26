
import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, type ElementRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useExplorerStore } from '@/stores/explorerStore';
import { FileTree } from './FileTree';
import { MoveToDialog } from './MoveToDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { FilePlus, FolderPlus, Search, Settings, ChevronDown } from 'lucide-react';
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
}

export interface FileBrowserHandle {
  refreshFileList: () => Promise<void>;
  refreshDirectories: (affectedDirs: Set<string>) => void;
}

export const FileBrowser = forwardRef<FileBrowserHandle, FileBrowserProps>(
  function FileBrowser({ client, onFileOpen, onSidebarToggle, isCollapsed = false, onSearch, onSettings }, ref) {
  const { metadata, currentFile, preferences, sidebarWidth: rawSidebarWidth, setSidebarWidth } = useWorkspaceStore();
  const { showToast } = useToast();
  const [rootFiles, setRootFiles] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootExpanded, setRootExpanded] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSourcePath, setMoveSourcePath] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetPaths, setDeleteTargetPaths] = useState<string[]>([]);
  const [creatingFileAtRoot, setCreatingFileAtRoot] = useState(0);
  const [creatingFolderAtRoot, setCreatingFolderAtRoot] = useState(0);
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

  if (!metadata) {
    return null;
  }

  const deleteMessage = deleteTargetPaths.length > 1
    ? `Are you sure you want to delete ${deleteTargetPaths.length} items? This action cannot be undone.`
    : `Are you sure you want to delete "${deleteTargetPaths[0]?.split('/').pop() || deleteTargetPaths[0]}"? This action cannot be undone.`;

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "group/sidebar h-full flex-shrink-0 bg-sidebar-bg flex flex-col relative",
          "transition-[margin] duration-300 ease-in-out",
          !isCollapsed && "border-r border-border"
        )}
        style={{
          width: resolvedSidebarWidth,
          marginLeft: isCollapsed ? -resolvedSidebarWidth : 0,
        }}
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
        <div className="flex-shrink-0 px-2 pt-2 pb-1 space-y-0.5">
          <button
            onClick={onSearch}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-muted/30",
              "transition-colors duration-150"
            )}
          >
            <Search size={16} />
            <span>Search</span>
          </button>

          <button
            onClick={onSettings}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-muted/30",
              "transition-colors duration-150"
            )}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>

          <button
            onClick={() => setCreatingFileAtRoot(c => c + 1)}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-muted/30",
              "transition-colors duration-150"
            )}
            title="New file"
          >
            <FilePlus size={16} />
            <span>New file</span>
          </button>

          <button
            onClick={() => setCreatingFolderAtRoot(c => c + 1)}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-muted/30",
              "transition-colors duration-150"
            )}
            title="New folder"
          >
            <FolderPlus size={16} />
            <span>New folder</span>
          </button>
        </div>

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
                setDeleteTargetPaths([path]);
                setDeleteDialogOpen(true);
              }}
              onDeleteMultiple={(paths) => {
                setDeleteTargetPaths(paths);
                setDeleteDialogOpen(true);
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

    <ConfirmDialog
      isOpen={deleteDialogOpen}
      onClose={() => setDeleteDialogOpen(false)}
      onConfirm={async () => {
        if (!client) return;

        try {
          const dirsToRefresh = new Set<string>();
          for (const path of deleteTargetPaths) {
            await client.deleteFile(path);
            const parentPath = path.substring(0, path.lastIndexOf('/')) || '.';
            dirsToRefresh.add(parentPath);
          }
          for (const dir of dirsToRefresh) {
            await loadDirectory(dir);
          }
          useExplorerStore.getState().clearSelection();
        } catch (error) {
          console.error('[FileBrowser] Failed to delete:', error);
          setError(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }}
      title={deleteTargetPaths.length > 1 ? `Delete ${deleteTargetPaths.length} items` : 'Delete file'}
      message={deleteMessage}
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
    />
    </>
  );
  }
);
