import { useState, useEffect, useCallback } from 'react';
import { Trash2, RotateCcw, X, File, Folder } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { cn } from '@/lib/utils';
import type { TrashItem } from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';

interface TrashViewerPanelProps {
  client: CoordinatorClient;
  onClose: () => void;
  onFileRestored: () => void;
}

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function TrashViewerPanel({ client, onClose, onFileRestored }: TrashViewerPanelProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [contextMenu, setContextMenu] = useState<{ item: TrashItem; x: number; y: number } | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const { items: trashItems } = await client.listTrash();
      setItems(trashItems);
    } catch (err) {
      console.error('[TrashViewer] Failed to list trash:', err);
    }
  }, [client]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleRestore = async (ids: string[]) => {
    try {
      await client.restoreFromTrash(ids);
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      onFileRestored();
    } catch (err) {
      console.error('[TrashViewer] Failed to restore:', err);
    }
  };

  const handlePermanentDelete = async (ids: string[]) => {
    try {
      await client.permanentlyDeleteFromTrash(ids);
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
    } catch (err) {
      console.error('[TrashViewer] Failed to permanently delete:', err);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await client.emptyTrash();
      setItems([]);
    } catch (err) {
      console.error('[TrashViewer] Failed to empty trash:', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-elevated">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Trash2 size={16} className="text-accent" />
        <span className="font-medium text-sm">Trash</span>
        <span className="ml-1 text-xs text-foreground-muted bg-surface-tertiary px-2 py-0.5 rounded-full">
          {items.length}
        </span>
        {items.length > 0 && (
          <button
            onClick={() => setConfirmEmpty(true)}
            className="ml-auto text-xs text-accent-red hover:text-[var(--accent-red-hover)] transition-colors"
          >
            Empty Trash
          </button>
        )}
        <button
          onClick={onClose}
          className={cn(
            items.length === 0 && 'ml-auto',
            "p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-colors"
          )}
          title="Close trash"
          aria-label="Close trash"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-foreground-muted text-sm p-4">
            <Trash2 size={32} className="mb-2 opacity-30" />
            <p>Trash is empty</p>
          </div>
        ) : (
          <div className="p-2">
            {items.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-tertiary transition-colors text-left group"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ item, x: e.clientX, y: e.clientY });
                }}
              >
                {item.isDirectory ? (
                  <Folder size={14} className="text-foreground-muted flex-shrink-0" />
                ) : (
                  <File size={14} className="text-foreground-muted flex-shrink-0" />
                )}
                <span className="text-sm truncate flex-1">{item.originalPath}</span>
                <span className="text-xs text-foreground-faint flex-shrink-0">
                  {relativeTime(item.deletedAt)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore([item.id]);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-all"
                  title="Restore"
                >
                  <RotateCcw size={13} />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-modal-bg border border-modal-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-tertiary transition-colors"
            onClick={() => {
              handleRestore([contextMenu.item.id]);
              setContextMenu(null);
            }}
          >
            Restore
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-accent-red hover:bg-surface-tertiary transition-colors"
            onClick={() => {
              handlePermanentDelete([contextMenu.item.id]);
              setContextMenu(null);
            }}
          >
            Delete permanently
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        onConfirm={handleEmptyTrash}
        title="Empty Trash"
        message={`Permanently delete ${items.length} item${items.length !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmText="Empty Trash"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
