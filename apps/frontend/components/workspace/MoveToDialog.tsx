'use client';

import { useState, useEffect } from 'react';
import type { FileTreeNode } from '@cushion/types';
import { Folder, ChevronRight, ChevronDown, X } from 'lucide-react';

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
          // Filter to show only directories
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
            className={`tree-item ${isSelected ? 'selected' : ''}`}
            style={{
              paddingLeft: `${level * 12 + 12}px`,
            }}
          >
            <div
              className="expand-icon"
              onClick={(e) => {
                e.stopPropagation();
                toggleDirectory(node.path);
              }}
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
            <div
              className="folder-content"
              onClick={() => setSelectedPath(node.path)}
            >
              <Folder size={16} />
              <span className="folder-name">{node.name}</span>
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
    <>
      {/* Backdrop */}
      <div
        className="dialog-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Dialog */}
        <div
          className="move-dialog"
          onClick={(e) => e.stopPropagation()}
        >
          <style jsx>{`
            .move-dialog {
              background: white;
              border-radius: 8px;
              width: 480px;
              max-height: 600px;
              display: flex;
              flex-direction: column;
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            }

            .dialog-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 16px 20px;
              border-bottom: 1px solid rgba(0, 0, 0, 0.1);
            }

            .dialog-title {
              font-size: 16px;
              font-weight: 600;
              color: rgba(0, 0, 0, 0.9);
            }

            .close-button {
              background: transparent;
              border: none;
              cursor: pointer;
              padding: 4px;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: rgba(0, 0, 0, 0.5);
              transition: all 0.15s;
            }

            .close-button:hover {
              background: rgba(0, 0, 0, 0.05);
              color: rgba(0, 0, 0, 0.8);
            }

            .dialog-body {
              flex: 1;
              overflow-y: auto;
              padding: 12px;
              min-height: 300px;
            }

            .tree-item {
              display: flex;
              align-items: center;
              padding: 6px 8px;
              border-radius: 4px;
              cursor: pointer;
              transition: background 0.15s;
              user-select: none;
            }

            .tree-item:hover {
              background: rgba(0, 0, 0, 0.05);
            }

            .tree-item.selected {
              background: rgba(0, 120, 212, 0.1);
              color: #0078d4;
            }

            .expand-icon {
              width: 16px;
              height: 16px;
              display: flex;
              align-items: center;
              justify-content: center;
              margin-right: 4px;
              flex-shrink: 0;
              color: rgba(0, 0, 0, 0.5);
            }

            .folder-content {
              display: flex;
              align-items: center;
              gap: 8px;
              flex: 1;
            }

            .folder-name {
              font-size: 14px;
            }

            .dialog-footer {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 16px 20px;
              border-top: 1px solid rgba(0, 0, 0, 0.1);
              gap: 12px;
            }

            .selected-path {
              flex: 1;
              font-size: 13px;
              color: rgba(0, 0, 0, 0.6);
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .dialog-actions {
              display: flex;
              gap: 8px;
            }

            .button {
              padding: 8px 16px;
              border-radius: 4px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.15s;
              border: none;
            }

            .button-cancel {
              background: transparent;
              color: rgba(0, 0, 0, 0.7);
              border: 1px solid rgba(0, 0, 0, 0.2);
            }

            .button-cancel:hover {
              background: rgba(0, 0, 0, 0.05);
            }

            .button-move {
              background: #0078d4;
              color: white;
            }

            .button-move:hover {
              background: #106ebe;
            }
          `}</style>

          {/* Header */}
          <div className="dialog-header">
            <div className="dialog-title">Move to folder</div>
            <button className="close-button" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="dialog-body">
            {/* Root folder */}
            <div
              className={`tree-item ${selectedPath === '.' ? 'selected' : ''}`}
              style={{ paddingLeft: '12px' }}
            >
              <div
                className="expand-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDirectory('.');
                }}
              >
                {expandedDirs.has('.') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              <div
                className="folder-content"
                onClick={() => setSelectedPath('.')}
              >
                <Folder size={16} />
                <span className="folder-name">Project Root</span>
              </div>
            </div>

            {/* Tree */}
            {expandedDirs.has('.') && renderTree(rootFiles)}
          </div>

          {/* Footer */}
          <div className="dialog-footer">
            <div className="selected-path" title={selectedPath}>
              Moving to: {selectedPath === '.' ? 'Project Root' : selectedPath}
            </div>
            <div className="dialog-actions">
              <button className="button button-cancel" onClick={onClose}>
                Cancel
              </button>
              <button className="button button-move" onClick={handleMove}>
                Move
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
