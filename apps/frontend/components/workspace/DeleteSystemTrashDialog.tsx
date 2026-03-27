
import { useState } from 'react';
import { X } from 'lucide-react';

interface DeleteSystemTrashDialogProps {
  paths: string[] | null;
  onClose: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
}

export function DeleteSystemTrashDialog({ paths, onClose, onConfirm }: DeleteSystemTrashDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!paths) return null;

  const isSingle = paths.length === 1;
  const fileName = isSingle ? (paths[0].split('/').pop() || paths[0]) : '';

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[420px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-foreground">
            {isSingle ? 'Delete file' : `Delete ${paths.length} files`}
          </h3>
          <button
            className="shrink-0 p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5">
          <p className="text-sm text-foreground-muted leading-normal">
            {isSingle
              ? `Are you sure you want to delete "${fileName}"?`
              : `Are you sure you want to delete these ${paths.length} items?`}
          </p>
          <p className="text-sm text-foreground-muted leading-normal mt-2">
            {isSingle ? 'It' : 'They'} will be moved to your system trash.
          </p>
        </div>

        <div className="flex items-center justify-between px-5 pb-5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 rounded border border-border accent-[var(--accent-primary)]"
            />
            <span className="text-sm text-foreground-muted">Don't ask again</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none text-surface bg-accent-red hover:bg-[var(--accent-red-hover)] transition-all"
              onClick={() => onConfirm(dontAskAgain)}
              autoFocus
            >
              Delete
            </button>
            <button
              className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
