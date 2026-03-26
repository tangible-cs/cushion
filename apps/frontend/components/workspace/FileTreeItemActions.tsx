
import { Plus, FolderInput, FolderPlus, FilePlus, Pencil, Trash2, Files, Scissors, Copy, ClipboardPaste } from 'lucide-react';
import type { FileTreeNode } from '@cushion/types';
import type { ContextMenuItem } from './ContextMenu';
import { cn } from '@/lib/utils';
import { useExplorerStore } from '@/stores/explorerStore';

interface MenuItemCallbacks {
  onAddFile?: () => void;
  onAddFolder?: () => void;
  onRename?: () => void;
  onDelete?: (path: string) => void;
  onDeleteMultiple?: (paths: string[]) => void;
  onDuplicate?: (path: string) => void;
  onMoveTo?: (path: string) => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: (destinationDir: string) => void;
}

export function buildMenuItems(node: FileTreeNode, callbacks: MenuItemCallbacks): ContextMenuItem[] {
  const { onAddFile, onAddFolder, onRename, onDelete, onDeleteMultiple, onDuplicate, onMoveTo, onCut, onCopy, onPaste } = callbacks;
  const { selectedPaths, clipboard } = useExplorerStore.getState();
  const multiCount = selectedPaths.size;
  const isMulti = multiCount > 1;

  // Determine paste destination
  const pasteDir = node.type === 'directory' ? node.path : (node.path.lastIndexOf('/') > 0 ? node.path.slice(0, node.path.lastIndexOf('/')) : '.');

  return [
    ...(node.type === 'directory' && !isMulti ? [{
      id: 'new-file',
      label: 'New file',
      icon: FilePlus,
      onClick: () => onAddFile?.(),
    } as ContextMenuItem] : []),
    ...(node.type === 'directory' && !isMulti ? [{
      id: 'new-folder',
      label: 'New folder',
      icon: FolderPlus,
      onClick: () => onAddFolder?.(),
      separator: true,
    } as ContextMenuItem] : []),
    ...(!isMulti ? [{
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      shortcut: 'F2',
      onClick: () => onRename?.(),
    } as ContextMenuItem] : []),
    ...(!isMulti ? [{
      id: 'duplicate',
      label: 'Duplicate',
      icon: Files,
      onClick: () => onDuplicate?.(node.path),
    } as ContextMenuItem] : []),
    {
      id: 'cut',
      label: 'Cut',
      icon: Scissors,
      shortcut: 'Ctrl+X',
      onClick: () => onCut?.(),
    },
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      shortcut: 'Ctrl+C',
      onClick: () => onCopy?.(),
    },
    ...(clipboard ? [{
      id: 'paste',
      label: 'Paste',
      icon: ClipboardPaste,
      shortcut: 'Ctrl+V',
      onClick: () => onPaste?.(pasteDir),
    } as ContextMenuItem] : []),
    ...(!isMulti ? [{
      id: 'move-to',
      label: 'Move to...',
      icon: FolderInput,
      onClick: () => onMoveTo?.(node.path),
      separator: true,
    } as ContextMenuItem] : [{
      id: 'separator-before-delete',
      label: '',
      onClick: () => {},
      separator: true,
    } as ContextMenuItem]),
    {
      id: 'delete',
      label: isMulti ? `Delete ${multiCount} items` : 'Delete',
      icon: Trash2,
      variant: 'danger' as const,
      shortcut: 'Del',
      onClick: () => {
        if (isMulti && onDeleteMultiple) {
          onDeleteMultiple([...selectedPaths]);
        } else {
          onDelete?.(node.path);
        }
      },
    },
  ];
}

interface FileTreeItemActionsProps {
  node: FileTreeNode;
  onAddFile?: () => void;
}

export function FileTreeItemActions({
  node,
  onAddFile,
}: FileTreeItemActionsProps) {
  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddFile) {
      onAddFile();
    }
  };

  const buttonClasses = cn(
    "flex items-center justify-center w-5 h-5 rounded",
    "bg-transparent border-none cursor-pointer",
    "text-muted-foreground hover:text-foreground",
    "hover:bg-muted/40",
    "transition-colors duration-150"
  );

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-0.5 ml-auto",
          "transition-opacity duration-150",
          "opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto"
        )}
      >
        {node.type === 'directory' && (
          <button
            onClick={handleAddClick}
            className={buttonClasses}
            title="New file"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </>
  );
}
