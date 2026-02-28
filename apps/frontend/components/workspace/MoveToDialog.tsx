'use client';

import { useState, useEffect } from 'react';
import type { FileTreeNode } from '@cushion/types';
import { Folder, ChevronRight, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MoveToDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetPath: string) => void;
  currentPath: string;
  rootFiles: FileTreeNode[];
  onLoadDirectory: (path: string) => Promise<FileTreeNode[]>;
}

export function MoveToDialog({
  isOpen,
  onClose,
  onMove,
  currentPath,
  rootFiles,
  onLoadDirectory,
}: MoveToDialogProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['.']));
  const [dirContents, setDirContents] = useState<Map<string, FileTreeNode[]>>(new Map([['.', rootFiles]]));
  const [selectedPath, setSelectedPath] = useState<string>('.');

  useEffect(() => {
    if (isOpen) {
      setDirContents(new Map([['.', rootFiles]]));
      setSelectedPath('.');
    }
  }, [isOpen, rootFiles]);

  const toggleDirectory = async (path: string) => {
    const isExpanded = expandedDirs.has(path);

    if (isExpanded) {
      const newExpanded = new Set(expandedDirs);
      newExpanded.delete(path);
      setExpandedDirs(newExpanded);
    } else {
      if (!dirContents.has(path)) {
        try {
          const contents = await onLoadDirectory(path);
          const directories = contents.filter(node => node.type === 'directory');
          setDirContents(new Map(dirContents).set(path, directories));
        } catch (error) {
          console.error(`Failed to load directory ${path}:`, error);
        }
      }

      const newExpanded = new Set(expandedDirs);
      newExpanded.add(path);
      setExpandedDirs(newExpanded);
    }
  };

  const handleMove = () => {
    if (selectedPath === currentPath) {
      alert('Cannot move to the same location');
      return;
    }

    onMove(selectedPath);
    onClose();
  };

  const renderTree = (nodes: FileTreeNode[], level: number = 0) => {
    return nodes.map((node) => {
      if (node.type !== 'directory') return null;

      const isExpanded = expandedDirs.has(node.path);
      const isSelected = selectedPath === node.path;
      const children = dirContents.get(node.path);

      return (
        <div key={node.path}>
          <div
            className={cn(
              "flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors select-none hover:bg-[var(--overlay-10)]",
              isSelected && "bg-[var(--accent-primary-12)] text-accent"
            )}
            style={{ paddingLeft: `${level * 12 + 12}px` }}
          >
            <div
              className="w-4 h-4 flex items-center justify-center mr-1 shrink-0 text-foreground-subtle"
              onClick={(e) => {
                e.stopPropagation();
                toggleDirectory(node.path);
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            <div
              className="flex items-center gap-2 flex-1"
              onClick={() => setSelectedPath(node.path)}
            >
              <Folder size={16} />
              <span className="text-sm">{node.name}</span>
            </div>
          </div>

          {isExpanded && children && (
            <div>{renderTree(children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[480px] max-h-[600px] flex flex-col shadow-lg border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-modal-border">
          <div className="text-base font-semibold text-foreground">Move to folder</div>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all bg-transparent border-none"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 min-h-[300px]">
          {/* Root folder */}
          <div
            className={cn(
              "flex items-center py-1.5 px-2 rounded cursor-pointer transition-colors select-none hover:bg-[var(--overlay-10)]",
              selectedPath === "." && "bg-[var(--accent-primary-12)] text-accent"
            )}
            style={{ paddingLeft: '12px' }}
          >
            <div
              className="w-4 h-4 flex items-center justify-center mr-1 shrink-0 text-foreground-subtle"
              onClick={(e) => {
                e.stopPropagation();
                toggleDirectory('.');
              }}
            >
              {expandedDirs.has('.') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            <div
              className="flex items-center gap-2 flex-1"
              onClick={() => setSelectedPath('.')}
            >
              <Folder size={16} />
              <span className="text-sm">Project Root</span>
            </div>
          </div>

          {/* Tree */}
          {expandedDirs.has('.') && renderTree(rootFiles)}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-modal-border gap-3">
          <div className="flex-1 text-[13px] text-foreground-muted overflow-hidden text-ellipsis whitespace-nowrap" title={selectedPath}>
            Moving to: {selectedPath === '.' ? 'Project Root' : selectedPath}
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded text-sm font-medium cursor-pointer border-none bg-accent text-surface hover:bg-accent-hover transition-all"
              onClick={handleMove}
            >
              Move
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
