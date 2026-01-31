'use client';

import { useState } from 'react';
import { MoreVertical, Plus, FolderInput, FolderPlus, Pencil, Trash2, Files, Sparkles } from 'lucide-react';
import type { FileTreeNode } from '@cushion/types';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { cn } from '@/lib/utils';

interface FileTreeItemActionsProps {
  node: FileTreeNode;
  isVisible: boolean;
  onAddFile?: () => void;
  onAddFolder?: () => void;
  onRename?: () => void;
  onDelete?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onMoveTo?: (path: string) => void;
  onAskAI?: (path: string) => void;
}

export function FileTreeItemActions({
  node,
  isVisible,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onDuplicate,
  onMoveTo,
  onAskAI,
}: FileTreeItemActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddFile) {
      onAddFile();
    }
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.right + 4,
      y: rect.top,
    });
    setMenuOpen(true);
  };

  const menuItems: ContextMenuItem[] = [
    ...(node.type === 'file' ? [{
      id: 'ask-ai',
      label: 'Ask AI about this file',
      icon: Sparkles,
      onClick: () => onAskAI?.(node.path),
      separator: true,
    } as ContextMenuItem] : []),
    ...(node.type === 'directory' ? [{
      id: 'new-folder',
      label: 'New folder',
      icon: FolderPlus,
      onClick: () => onAddFolder?.(),
      separator: true,
    } as ContextMenuItem] : []),
    {
      id: 'rename',
      label: 'Rename',
      icon: Pencil,
      shortcut: 'Ctrl+R',
      onClick: () => onRename?.(),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: Files,
      shortcut: 'Ctrl+D',
      onClick: () => onDuplicate?.(node.path),
    },
    {
      id: 'move-to',
      label: 'Move to...',
      icon: FolderInput,
      shortcut: 'Ctrl+P',
      onClick: () => onMoveTo?.(node.path),
      separator: true,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      variant: 'danger',
      onClick: () => onDelete?.(node.path),
    },
  ];

  const buttonClasses = cn(
    "flex items-center justify-center w-5 h-5 rounded",
    "bg-transparent border-none cursor-pointer",
    "text-muted-foreground hover:text-foreground",
    "hover:bg-black/[0.06] dark:hover:bg-white/[0.08]",
    "transition-colors duration-150"
  );

  return (
    <>
      <ContextMenu
        items={menuItems}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        position={menuPosition}
      />

      <div
        className={cn(
          "flex items-center gap-0.5 ml-auto",
          "transition-opacity duration-150",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <button
          onClick={handleMenuClick}
          className={buttonClasses}
          title="More actions"
        >
          <MoreVertical size={14} strokeWidth={2} />
        </button>

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
