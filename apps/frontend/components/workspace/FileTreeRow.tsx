import { memo, useCallback } from 'react';
import type { FileTreeNode } from '@cushion/types';
import { FileTreeItemActions } from './FileTreeItemActions';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExplorerStore } from '@/stores/explorerStore';
import { FolderIcon, FileIcon } from '@/components/shared/FileIcons';
import type { FlatTreeItem } from './flattenTree';

interface FileTreeRowProps {
  item: FlatTreeItem;
  currentFile: string | null;
  onFileClick: (path: string, forceNewTab?: boolean) => void;
  onToggleDirectory: (path: string) => void;
  onStartRename: (node: FileTreeNode) => void;
  onStartCreateFile: (parentPath: string) => void;
  onStartCreateFolder: (parentPath: string) => void;
  onDragStart: (e: React.DragEvent, node: FileTreeNode) => void;
  onDragEnd: () => void;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  flatOrder: string[];
  dragOverDir: string | null;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onRenameSubmit: (node: FileTreeNode) => void;
  onRenameCancel: () => void;
}

export const FileTreeRow = memo(function FileTreeRow({
  item,
  currentFile,
  onFileClick,
  onToggleDirectory,
  onStartRename,
  onStartCreateFile,
  onStartCreateFolder,
  onDragStart,
  onDragEnd,
  onContextMenu,
  flatOrder,
  dragOverDir,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
}: FileTreeRowProps) {
  const { node, depth, path } = item;
  const isFolder = node.type === 'directory';

  const selectedPaths = useExplorerStore((s) => s.selectedPaths);
  const renamingPath = useExplorerStore((s) => s.renamingPath);
  const clipboard = useExplorerStore((s) => s.clipboard);
  const focusedPath = useExplorerStore((s) => s.focusedPath);
  const expandedDirs = useExplorerStore((s) => s.expandedDirs);
  const loadingDirs = useExplorerStore((s) => s.loadingDirs);
  const { selectOnly, toggleSelect, selectRange, setFocused } = useExplorerStore();

  const isExpanded = expandedDirs.has(path);
  const isLoading = loadingDirs.has(path);
  const isActive = currentFile === path;
  const isSelected = selectedPaths.has(path);
  const isCut = clipboard?.operation === 'cut' && clipboard.paths.includes(path);
  const isRenaming = renamingPath === path;
  const indentPx = depth * 20 + 6;

  const isDragHighlighted = dragOverDir !== null && (
    dragOverDir === path ||
    (dragOverDir !== '__root__' && path.startsWith(dragOverDir + '/'))
  );

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFocused(path, node.type);

    if (e.shiftKey) {
      selectRange(path, flatOrder);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(path);
      return;
    }

    selectOnly(path);
    if (isFolder) {
      onToggleDirectory(path);
    } else {
      onFileClick(path);
    }
  }, [path, node.type, isFolder, flatOrder, selectOnly, toggleSelect, selectRange, setFocused, onToggleDirectory, onFileClick]);

  return (
    <div
      className={cn(
        "group/item relative flex items-center min-h-[30px] px-1.5 rounded cursor-pointer transition-colors duration-150",
        "hover:bg-nav-bg-hover hover:text-nav-item-hover",
        isSelected ? "bg-nav-bg-selected text-nav-item-active"
          : (isActive && selectedPaths.size === 0 && focusedPath !== null) ? "bg-nav-bg-selected text-nav-item-active"
          : "text-nav-item",
        isCut && "opacity-50",
        isDragHighlighted && (isFolder && dragOverDir === path
          ? "bg-[var(--accent-primary-12)] ring-1 ring-accent/40"
          : "bg-[var(--accent-primary-12)]"
        )
      )}
      style={{ paddingLeft: `${indentPx}px` }}
      draggable={!isRenaming}
      onDragStart={(e) => onDragStart(e, node)}
      onDragEnd={onDragEnd}
      onContextMenu={(e) => onContextMenu(e, node)}
      onClick={handleClick}
      title={path}
    >
      <div className="relative w-5 h-5 flex items-center justify-center flex-shrink-0 mr-2 text-muted-foreground">
        {isFolder ? (
          <>
            <FolderIcon
              open={isExpanded}
              className="absolute transition-opacity duration-150 opacity-100 group-hover/item:opacity-0"
            />
            <ChevronDown
              size={16}
              className={cn(
                "absolute transition-all duration-200 opacity-0 group-hover/item:opacity-100",
                !isExpanded && "-rotate-90"
              )}
            />
            {isLoading && (
              <span className="absolute animate-spin text-xs">&#x23F3;</span>
            )}
          </>
        ) : (
          <FileIcon />
        )}
      </div>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isRenaming ? (
          <>
            <input
              className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-0.5 text-sm outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/10"
              type="text"
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onBlur={() => onRenameSubmit(node)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRenameSubmit(node);
                else if (e.key === 'Escape') onRenameCancel();
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {node.name.endsWith('.md') && (
              <span className="text-sm text-muted-foreground shrink-0">.md</span>
            )}
          </>
        ) : (
          <span className={cn("truncate", isFolder && "font-medium")}>
            {node.name.endsWith('.md') ? node.name.slice(0, -3) : node.name}
          </span>
        )}
      </div>

      {!isRenaming && (
        <FileTreeItemActions
          node={node}
          onAddFile={() => onStartCreateFile(path)}
        />
      )}
    </div>
  );
});
