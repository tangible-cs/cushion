'use client';

import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef, ElementRef } from 'react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { FileTree } from './FileTree';
import { MoveToDialog } from './MoveToDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { FilePlus, FolderPlus, RefreshCw, ChevronsLeft, FolderOpen, Search, Sparkles, Settings, ChevronDown } from 'lucide-react';
import { useMediaQuery } from 'usehooks-ts';
import { cn } from '@/lib/utils';
import type { FileTreeNode } from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';

interface FileBrowserProps {
  client: CoordinatorClient | null;
  onFileOpen: (path: string, content: string) => void;
  onNewDocument?: () => void;
  onOpenWorkspace?: () => void;
  onSidebarToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
  onSearch?: () => void;
  onIntelligence?: () => void;
  onSettings?: () => void;
  onAskAIFile?: (path: string) => void;
}

export interface FileBrowserHandle {
  refreshFileList: () => Promise<void>;
}

export const FileBrowser = forwardRef<FileBrowserHandle, FileBrowserProps>(
  function FileBrowser({ client, onFileOpen, onNewDocument, onOpenWorkspace, onSidebarToggle, isCollapsed: isCollapsedProp = false, onSearch, onIntelligence, onSettings, onAskAIFile }, ref) {
  const { metadata, currentFile } = useWorkspaceStore();
  const [rootFiles, setRootFiles] = useState<FileTreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rootExpanded, setRootExpanded] = useState(true);
  // Use prop if provided, otherwise use internal state
  const [isCollapsedInternal, setIsCollapsedInternal] = useState(false);
  const isCollapsed = isCollapsedProp !== undefined ? isCollapsedProp : isCollapsedInternal;
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSourcePath, setMoveSourcePath] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetPath, setDeleteTargetPath] = useState<string>('');
  const [creatingFileAtRoot, setCreatingFileAtRoot] = useState(0);
  const [creatingFolderAtRoot, setCreatingFolderAtRoot] = useState(0);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const sidebarRef = useRef<ElementRef<"aside">>(null);

  const loadDirectory = useCallback(async (relativePath: string): Promise<FileTreeNode[]> => {
    if (!client) {
      console.warn('[FileBrowser] Client not available');
      return [];
    }

    try {
      setIsLoading(true);
      setError(null);

      const { files } = await client.listFiles(relativePath);

      if (relativePath === '.') {
        setRootFiles(files);
      }

      return files;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load directory';
      setError(errorMsg);
      console.error('[FileBrowser] Error loading directory:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  // Animation functions
  const collapseSidebar = useCallback(() => {
    console.log('[FileBrowser] Collapsing sidebar');
    setIsCollapsedInternal(true);
    if (onSidebarToggle) {
      onSidebarToggle(true);
    }
  }, [onSidebarToggle]);

  const resetWidth = useCallback(() => {
    console.log('[FileBrowser] Expanding sidebar');
    setIsCollapsedInternal(false);
    if (onSidebarToggle) {
      onSidebarToggle(false);
    }
  }, [onSidebarToggle]);

  // Mobile auto-collapse - only run when isMobile changes
  useEffect(() => {
    if (isMobile) {
      collapseSidebar();
    } else {
      resetWidth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]); // Only depend on isMobile, not the functions

  // Load root directory when workspace opens
  useEffect(() => {
    if (metadata && client) {
      loadDirectory('.');
    }
  }, [metadata?.projectPath, client, loadDirectory]);

  // Expose refresh method via ref
  useImperativeHandle(ref, () => ({
    refreshFileList: async () => {
      console.log('[FileBrowser] Refreshing file list');
      await loadDirectory('.');
    },
  }), [loadDirectory]);

  const handleFileClick = async (filePath: string) => {
    if (!client) {
      console.warn('[FileBrowser] Client not available');
      return;
    }

    try {
      const { content } = await client.readFile(filePath);
      onFileOpen(filePath, content);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to open file';
      setError(errorMsg);
      console.error('[FileBrowser] Error opening file:', err);
    }
  };

  // Notify parent when workspace state changes
  useEffect(() => {
    if (!metadata && onSidebarToggle) {
      // No workspace = sidebar collapsed
      onSidebarToggle(true);
    } else if (metadata && onSidebarToggle && !isCollapsed) {
      // Workspace loaded and sidebar not manually collapsed = sidebar expanded
      onSidebarToggle(false);
    }
  }, [metadata, onSidebarToggle, isCollapsed]);

  // When no workspace is loaded, show folder icon
  if (!metadata) {
    return (
      <div
        className="fixed top-3 left-3 z-[100]"
        style={{ pointerEvents: 'auto' }}
      >
        <div
          onClick={() => {
            if (onOpenWorkspace) {
              onOpenWorkspace();
            }
          }}
          role="button"
          className={cn(
            "h-8 w-8 rounded flex items-center justify-center cursor-pointer",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
            "transition-colors duration-150"
          )}
          title="Open workspace"
        >
          <FolderOpen size={18} />
        </div>
      </div>
    );
  }

  // Generate a consistent color for the workspace avatar based on name
  const avatarColor = metadata.projectName
    ? `hsl(${metadata.projectName.charCodeAt(0) * 10 % 360}, 70%, 60%)`
    : 'hsl(210, 70%, 60%)';

  return (
    <>
      <aside
        ref={sidebarRef}
        className={cn(
          "group/sidebar h-screen w-[240px] flex-shrink-0 bg-sidebar-bg flex flex-col",
          "transition-[margin] duration-300 ease-in-out",
          isCollapsed && "-ml-[240px]"
        )}
      >
        {/* Top bar — h-10 to align with tab bar */}
        <div className="flex-shrink-0 h-10 px-3 flex items-center gap-2">
          {/* Logo placeholder */}
          <div
            className="w-6 h-6 rounded flex-shrink-0"
            style={{ backgroundColor: avatarColor }}
          />

          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-0.5">
            {/* Collapse button (<<) */}
            <div
              onClick={collapseSidebar}
              role="button"
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center cursor-pointer",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
                "transition-colors duration-150"
              )}
              title="Close sidebar"
            >
              <ChevronsLeft size={16} />
            </div>

            {/* New file */}
            <button
              onClick={() => {
                setCreatingFileAtRoot(c => c + 1);
              }}
              title="New file"
              className={cn(
                "h-6 w-6 rounded flex items-center justify-center",
                "bg-transparent border-none",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
                "transition-colors duration-150"
              )}
            >
              <FilePlus size={16} />
            </button>

            {/* New folder */}
            <button
              onClick={() => {
                setCreatingFolderAtRoot(c => c + 1);
              }}
              title="New folder"
              className={cn(
                "h-6 w-6 rounded flex items-center justify-center",
                "bg-transparent border-none",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
                "transition-colors duration-150"
              )}
            >
              <FolderPlus size={16} />
            </button>

            {/* Refresh */}
            <button
              onClick={() => loadDirectory('.')}
              title="Refresh explorer"
              className={cn(
                "h-6 w-6 rounded flex items-center justify-center",
                "bg-transparent border-none",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
                "transition-colors duration-150"
              )}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Navigation items */}
        <div className="flex-shrink-0 px-2 py-1 space-y-0.5">
          {/* Search */}
          <button
            onClick={onSearch}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              "transition-colors duration-150"
            )}
          >
            <Search size={16} />
            <span>Search</span>
          </button>

          {/* Intelligence */}
          <button
            onClick={onIntelligence}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              "transition-colors duration-150"
            )}
          >
            <Sparkles size={16} />
            <span>Intelligence</span>
          </button>

          {/* Settings */}
          <button
            onClick={onSettings}
            className={cn(
              "w-full flex items-center gap-3 px-2 h-8 rounded-md",
              "text-sm text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              "transition-colors duration-150"
            )}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>

        {/* Spacing before file tree */}
        <div className="flex-shrink-0 h-2" />

        {/* Root folder toggle + file tree */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {/* Root folder row */}
          <button
            onClick={() => setRootExpanded(!rootExpanded)}
            className={cn(
              "w-full flex items-center gap-1.5 px-1 h-[26px] rounded text-xs font-semibold uppercase tracking-wide",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
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

          {/* File tree (collapsible) */}
          {rootExpanded && (
            isLoading && rootFiles.length === 0 ? (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              Loading files...
            </div>
          ) : error ? (
            <div className="p-4 m-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
              <div>{error}</div>
              <button
                onClick={() => loadDirectory('.')}
                className="mt-2 px-3 py-1 bg-white dark:bg-neutral-800 border border-red-200 dark:border-red-800 rounded text-xs hover:bg-red-50 dark:hover:bg-red-900/20 transition"
              >
                Retry
              </button>
            </div>
          ) : (
            <FileTree
              nodes={rootFiles}
              onFileClick={handleFileClick}
              currentFile={currentFile}
              onLoadDirectory={loadDirectory}
              onAskAI={onAskAIFile}
              creatingFileAtRoot={creatingFileAtRoot}
              creatingFolderAtRoot={creatingFolderAtRoot}
              onRootCreationDone={() => {
                setCreatingFileAtRoot(0);
                setCreatingFolderAtRoot(0);
              }}
              onAddFile={async (filePath) => {
                console.log('[FileBrowser] Create file:', filePath);
                if (!client) return;

                try {
                  // Create empty file
                  await client.saveFile(filePath, '');
                  // Reload the parent directory
                  const parentPath = filePath.substring(0, filePath.lastIndexOf('/')) || '.';
                  await loadDirectory(parentPath);
                } catch (error) {
                  console.error('[FileBrowser] Failed to create file:', error);
                  setError(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onAddFolder={async (folderPath) => {
                console.log('[FileBrowser] Create folder:', folderPath);
                if (!client) return;

                try {
                  await client.createFolder(folderPath);
                  const parentPath = folderPath.substring(0, folderPath.lastIndexOf('/')) || '.';
                  await loadDirectory(parentPath);
                } catch (error) {
                  console.error('[FileBrowser] Failed to create folder:', error);
                  setError(`Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onRename={async (oldPath, newPath) => {
                console.log('[FileBrowser] Rename:', oldPath, '->', newPath);
                if (!client) return;

                try {
                  await client.renameFile(oldPath, newPath);
                  // Reload the parent directory to show updated files
                  const parentPath = oldPath.substring(0, oldPath.lastIndexOf('/')) || '.';
                  await loadDirectory(parentPath);
                } catch (error) {
                  console.error('[FileBrowser] Failed to rename:', error);
                  setError(`Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onDelete={(path) => {
                console.log('[FileBrowser] Delete:', path);
                setDeleteTargetPath(path);
                setDeleteDialogOpen(true);
              }}
              onDuplicate={async (path) => {
                console.log('[FileBrowser] Duplicate:', path);
                if (!client) return;

                try {
                  // Generate new path with (copy) suffix
                  const ext = path.lastIndexOf('.') > 0 ? path.substring(path.lastIndexOf('.')) : '';
                  const baseName = ext ? path.substring(0, path.lastIndexOf('.')) : path;
                  const newPath = `${baseName} (copy)${ext}`;

                  await client.duplicateFile(path, newPath);
                  // Reload the parent directory to show updated files
                  const parentPath = path.substring(0, path.lastIndexOf('/')) || '.';
                  await loadDirectory(parentPath);
                } catch (error) {
                  console.error('[FileBrowser] Failed to duplicate:', error);
                  setError(`Failed to duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }}
              onMoveTo={(path) => {
                console.log('[FileBrowser] Move to:', path);
                setMoveSourcePath(path);
                setMoveDialogOpen(true);
              }}
            />
          ))}
        </div>

        {/* Bottom workspace button (logo placeholder) */}
        <div className="flex-shrink-0 px-2 py-2 border-t border-black/[0.06] dark:border-white/[0.08]">
          <button
            onClick={() => onOpenWorkspace?.()}
            className={cn(
              "w-full flex items-center gap-2 rounded-md px-2 py-2",
              "text-muted-foreground hover:text-foreground",
              "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
              "transition-colors duration-150"
            )}
            title="Switch workspace"
            type="button"
          >
            <div
              className="w-7 h-7 rounded-md flex-shrink-0"
              style={{ backgroundColor: avatarColor }}
            />
            <div className="min-w-0 flex-1 text-left">
              <div className="text-xs font-semibold leading-4">Workspace</div>
              <div className="text-[11px] leading-4 truncate">{metadata.projectName}</div>
            </div>
          </button>
        </div>

      </aside>

    {/* Move To Dialog */}
    <MoveToDialog
      isOpen={moveDialogOpen}
      onClose={() => setMoveDialogOpen(false)}
      currentPath={moveSourcePath}
      rootFiles={rootFiles}
      onLoadDirectory={loadDirectory}
      onMove={async (targetPath) => {
        if (!client) return;

        try {
          // Get file/folder name
          const fileName = moveSourcePath.split('/').pop() || moveSourcePath;
          // Build new path
          const newPath = targetPath === '.' ? fileName : `${targetPath}/${fileName}`;

          await client.renameFile(moveSourcePath, newPath);
          // Reload both the source and target directories
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

    {/* Delete Confirmation Dialog */}
    <ConfirmDialog
      isOpen={deleteDialogOpen}
      onClose={() => setDeleteDialogOpen(false)}
      onConfirm={async () => {
        if (!client) return;

        try {
          await client.deleteFile(deleteTargetPath);
          // Reload the parent directory to show updated files
          const parentPath = deleteTargetPath.substring(0, deleteTargetPath.lastIndexOf('/')) || '.';
          await loadDirectory(parentPath);
        } catch (error) {
          console.error('[FileBrowser] Failed to delete:', error);
          setError(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }}
      title="Delete file"
      message={`Are you sure you want to delete "${deleteTargetPath.split('/').pop() || deleteTargetPath}"? This action cannot be undone.`}
      confirmText="Delete"
      cancelText="Cancel"
      variant="danger"
    />
    </>
  );
  }
);
