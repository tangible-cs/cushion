
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[400px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div
            className={cn(
              "shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
              variant === 'danger'
                ? "bg-[var(--accent-red-12)] text-accent-red"
                : "bg-border-subtle text-foreground-muted"
            )}
          >
            <AlertTriangle size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
            <p className="text-sm text-foreground-muted leading-normal">{message}</p>
          </div>
          <button
            className="shrink-0 p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pt-4 pb-5">
          <button
            className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent-primary-12)]"
            onClick={onClose}
          >
            {cancelText}
          </button>
          <button
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none text-surface transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent-primary-12)]",
              variant === 'danger'
                ? "bg-accent-red hover:bg-[var(--accent-red-hover)]"
                : "bg-accent hover:bg-accent-hover"
            )}
            onClick={handleConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
