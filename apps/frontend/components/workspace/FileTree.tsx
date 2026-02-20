'use client';

import { useState, useEffect } from 'react';
import type { FileTreeNode } from '@cushion/types';
import { FileTreeItemActions } from './FileTreeItemActions';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface FileTreeProps {
  nodes: FileTreeNode[];
  onFileClick: (path: string) => void;
  currentFile: string | null;
  level?: number;
  onLoadDirectory?: (path: string) => Promise<FileTreeNode[]>;
  onAddFile?: (filePath: string) => void | Promise<void>;
  onAddFolder?: (folderPath: string) => void | Promise<void>;
  onRename?: (oldPath: string, newPath: string) => void;
  onDelete?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onMoveTo?: (path: string) => void;
  onAskAI?: (path: string) => void;
  /** Externally trigger creating a file at root level (increment to re-trigger) */
  creatingFileAtRoot?: number;
  /** Externally trigger creating a folder at root level (increment to re-trigger) */
  creatingFolderAtRoot?: number;
  /** Called when root creation input is dismissed */
  onRootCreationDone?: () => void;
}

// Folder icon component - 20px (Affine-style)
function FolderIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H7.08579C7.35097 3.5 7.60536 3.60536 7.79289 3.79289L9.20711 5.20711C9.39464 5.39464 9.64903 5.5 9.91421 5.5H15.5C16.6046 5.5 17.5 6.39543 17.5 7.5V14.5C17.5 15.6046 16.6046 16.5 15.5 16.5H4.5C3.39543 16.5 2.5 15.6046 2.5 14.5V5.5Z"
        fill={open ? "currentColor" : "none"}
        fillOpacity={open ? 0.12 : 0}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// File icon component - 20px (Affine-style document)
function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M5 3.5C4.72386 3.5 4.5 3.72386 4.5 4V16C4.5 16.2761 4.72386 16.5 5 16.5H15C15.2761 16.5 15.5 16.2761 15.5 16V7.41421C15.5 7.28161 15.4473 7.15443 15.3536 7.06066L11.9393 3.64645C11.8456 3.55268 11.7184 3.5 11.5858 3.5H5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 3.5V7C11.5 7.27614 11.7239 7.5 12 7.5H15.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileTree({
  nodes,
  onFileClick,
  currentFile,
  level = 0,
  onLoadDirectory,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onDuplicate,
  onMoveTo,
  onAskAI,
  creatingFileAtRoot,
  creatingFolderAtRoot,
  onRootCreationDone,
}: FileTreeProps) {
  const showCushionFiles = useWorkspaceStore((s) => s.preferences.showCushionFiles);

  // Filter out .cushion directories when the preference is off
  const filteredNodes = showCushionFiles
    ? nodes
    : nodes.filter((n) => n.name !== '.cushion');

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirContents, setDirContents] = useState<Map<string, FileTreeNode[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [renamingItem, setRenamingItem] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [creatingFileInDir, setCreatingFileInDir] = useState<string | null>(null);
  const [creatingFolderInDir, setCreatingFolderInDir] = useState<string | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Re-fetch expanded directories when nodes change (e.g. after delete/rename/move)
  useEffect(() => {
    if (!onLoadDirectory) return;
    expandedDirs.forEach(async (dirPath) => {
      try {
        const contents = await onLoadDirectory(dirPath);
        setDirContents(prev => new Map(prev).set(dirPath, contents));
      } catch {
        // Directory may have been deleted — collapse it
        setExpandedDirs(prev => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
        setDirContents(prev => {
          const next = new Map(prev);
          next.delete(dirPath);
          return next;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Handle externally-triggered root-level creation
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

  const toggleDirectory = async (path: string) => {
    const isExpanded = expandedDirs.has(path);

    if (isExpanded) {
      // Collapse
      const newExpanded = new Set(expandedDirs);
      newExpanded.delete(path);
      setExpandedDirs(newExpanded);
    } else {
      // Expand - load contents if not already loaded
      if (!dirContents.has(path) && onLoadDirectory) {
        setLoadingDirs(new Set(loadingDirs).add(path));
        try {
          const contents = await onLoadDirectory(path);
          setDirContents(new Map(dirContents).set(path, contents));
        } catch (error) {
          console.error(`Failed to load directory ${path}:`, error);
        } finally {
          const newLoading = new Set(loadingDirs);
          newLoading.delete(path);
          setLoadingDirs(newLoading);
        }
      }

      const newExpanded = new Set(expandedDirs);
      newExpanded.add(path);
      setExpandedDirs(newExpanded);
    }
  };

  // Refresh a directory's contents in the local cache
  const refreshDir = async (dirPath: string) => {
    if (onLoadDirectory && dirPath !== '.' && dirPath !== '__root__') {
      const contents = await onLoadDirectory(dirPath);
      setDirContents(prev => new Map(prev).set(dirPath, contents));
    }
  };

  const handleStartRename = (node: FileTreeNode) => {
    setRenamingItem(node.path);
    setRenameValue(node.name);
  };

  const handleRenameSubmit = async (node: FileTreeNode) => {
    if (!renameValue.trim() || renameValue === node.name) {
      setRenamingItem(null);
      return;
    }

    if (onRename) {
      const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
      const newPath = parentPath ? `${parentPath}/${renameValue}` : renameValue;
      onRename(node.path, newPath);
    }

    setRenamingItem(null);
  };

  const handleRenameCancel = () => {
    setRenamingItem(null);
    setRenameValue('');
  };

  const handleStartCreateFile = (parentPath: string) => {
    // Expand the directory if not already expanded
    if (!expandedDirs.has(parentPath)) {
      toggleDirectory(parentPath);
    }
    setCreatingFileInDir(parentPath);
    setNewFileName('');
  };

  const handleCreateFileSubmit = async (parentPath: string) => {
    if (creatingFileInDir === null) return; // Already submitted
    if (!newFileName.trim()) {
      setCreatingFileInDir(null);
      onRootCreationDone?.();
      return;
    }

    setCreatingFileInDir(null);
    if (onAddFile) {
      const isRoot = parentPath === '.' || parentPath === '__root__';
      // Default to .md if no extension provided
      const name = newFileName.includes('.') ? newFileName : `${newFileName}.md`;
      const newPath = isRoot ? name : `${parentPath}/${name}`;
      await onAddFile(newPath);
      if (!isRoot) await refreshDir(parentPath);
    }

    setNewFileName('');
    onRootCreationDone?.();
  };

  const handleCreateFileCancel = () => {
    setCreatingFileInDir(null);
    setNewFileName('');
    onRootCreationDone?.();
  };

  const handleStartCreateFolder = (parentPath: string) => {
    // Ensure directory is expanded (don't toggle if already open)
    if (!expandedDirs.has(parentPath)) {
      toggleDirectory(parentPath);
    }
    setCreatingFileInDir(null);
    setCreatingFolderInDir(parentPath);
    setNewFolderName('');
  };

  const handleCreateFolderSubmit = async (parentPath: string) => {
    if (creatingFolderInDir === null) return; // Already submitted
    if (!newFolderName.trim()) {
      setCreatingFolderInDir(null);
      onRootCreationDone?.();
      return;
    }

    setCreatingFolderInDir(null);
    if (onAddFolder) {
      const isRoot = parentPath === '.' || parentPath === '__root__';
      const newPath = isRoot ? newFolderName : `${parentPath}/${newFolderName}`;
      await onAddFolder(newPath);
      if (!isRoot) await refreshDir(parentPath);
    }

    setNewFolderName('');
    onRootCreationDone?.();
  };

  const handleCreateFolderCancel = () => {
    setCreatingFolderInDir(null);
    setNewFolderName('');
    onRootCreationDone?.();
  };

  // Calculate indentation based on level
  const indentPx = level * 20;

  return (
    <div className="text-sm select-none">

      {/* Root-level new file input */}
      {creatingFileInDir === '__root__' && (
        <div
          className="flex items-center min-h-[30px] px-1.5"
          style={{ paddingLeft: `${indentPx + 6}px` }}
        >
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
            <FileIcon />
          </div>
          <input
            className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            type="text"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onBlur={() => handleCreateFileSubmit('__root__')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFileSubmit('__root__');
              } else if (e.key === 'Escape') {
                handleCreateFileCancel();
              }
            }}
            autoFocus
            placeholder="filename.md"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Root-level new folder input */}
      {creatingFolderInDir === '__root__' && (
        <div
          className="flex items-center min-h-[30px] px-1.5"
          style={{ paddingLeft: `${indentPx + 6}px` }}
        >
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
            <FolderIcon open={false} />
          </div>
          <input
            className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={() => handleCreateFolderSubmit('__root__')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateFolderSubmit('__root__');
              } else if (e.key === 'Escape') {
                handleCreateFolderCancel();
              }
            }}
            autoFocus
            placeholder="folder name"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {filteredNodes.map((node) => {
        const isExpanded = expandedDirs.has(node.path);
        const isLoading = loadingDirs.has(node.path);
        const isActive = currentFile === node.path;
        const isHovered = hoveredItem === node.path;
        const children = dirContents.get(node.path);
        const isFolder = node.type === 'directory';

        return (
          <div key={node.path}>
            {/* Tree item row */}
            <div
              className={cn(
                "group/item relative flex items-center min-h-[30px] px-1.5 rounded cursor-pointer transition-colors duration-150",
                "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]",
                isActive && "bg-black/[0.04] dark:bg-white/[0.06]"
              )}
              style={{ paddingLeft: `${indentPx + 6}px` }}
              onMouseEnter={() => setHoveredItem(node.path)}
              onMouseLeave={() => setHoveredItem(null)}
              onClick={() => {
                if (isFolder) {
                  toggleDirectory(node.path);
                } else {
                  onFileClick(node.path);
                }
              }}
              title={node.path}
            >
              {/* Icon container - 20px with swap behavior for folders */}
              <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
                {isFolder ? (
                  <>
                    {/* Folder icon - visible by default, hidden on hover */}
                    <FolderIcon
                      open={isExpanded}
                      className={cn(
                        "absolute transition-opacity duration-150",
                        isHovered ? "opacity-0" : "opacity-100"
                      )}
                    />
                    {/* Collapse arrow - hidden by default, visible on hover */}
                    <ChevronDown
                      size={16}
                      className={cn(
                        "absolute transition-all duration-200",
                        isHovered ? "opacity-100" : "opacity-0",
                        !isExpanded && "-rotate-90"
                      )}
                    />
                    {/* Loading indicator */}
                    {isLoading && (
                      <span className="absolute animate-spin text-xs">⏳</span>
                    )}
                  </>
                ) : (
                  <FileIcon />
                )}
              </div>

              {/* File/folder name */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {renamingItem === node.path ? (
                  <input
                    className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(node)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameSubmit(node);
                      } else if (e.key === 'Escape') {
                        handleRenameCancel();
                      }
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={cn(
                      "truncate text-foreground",
                      isFolder && "font-medium"
                    )}
                  >
                    {node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name}
                  </span>
                )}
              </div>

              {/* Actions - positioned absolutely, appear on hover */}
              <FileTreeItemActions
                node={node}
                isVisible={isHovered && renamingItem !== node.path}
                onAddFile={() => handleStartCreateFile(node.path)}
                onAddFolder={() => handleStartCreateFolder(node.path)}
                onRename={() => handleStartRename(node)}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
                onMoveTo={onMoveTo}
                onAskAI={onAskAI}
              />
            </div>

            {/* Children (expanded directory) */}
            {isFolder && isExpanded && (
              <>
                {children && (
                    <FileTree
                      nodes={children}
                      onFileClick={onFileClick}
                      currentFile={currentFile}
                      level={level + 1}
                      onLoadDirectory={onLoadDirectory}
                      onAddFile={onAddFile}
                      onRename={onRename}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                      onMoveTo={onMoveTo}
                      onAskAI={onAskAI}
                    />
                )}

                {/* New file input row */}
                {creatingFileInDir === node.path && (
                  <div
                    className="flex items-center min-h-[30px] px-1.5"
                    style={{ paddingLeft: `${(level + 1) * 20 + 6}px` }}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
                      <FileIcon />
                    </div>
                    <input
                      className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      type="text"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onBlur={() => handleCreateFileSubmit(node.path)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFileSubmit(node.path);
                        } else if (e.key === 'Escape') {
                          handleCreateFileCancel();
                        }
                      }}
                      autoFocus
                      placeholder="filename.txt"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* New folder input row */}
                {creatingFolderInDir === node.path && (
                  <div
                    className="flex items-center min-h-[30px] px-1.5"
                    style={{ paddingLeft: `${(level + 1) * 20 + 6}px` }}
                  >
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
                      <FolderIcon open={false} />
                    </div>
                    <input
                      className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onBlur={() => handleCreateFolderSubmit(node.path)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFolderSubmit(node.path);
                        } else if (e.key === 'Escape') {
                          handleCreateFolderCancel();
                        }
                      }}
                      autoFocus
                      placeholder="folder name"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
