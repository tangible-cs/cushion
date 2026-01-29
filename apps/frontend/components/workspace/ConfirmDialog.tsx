'use client';

import { X, AlertTriangle } from 'lucide-react';

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
      className="dialog-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 10001, // Higher than MoveToDialog
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <style jsx>{`
        .confirm-dialog {
          background: white;
          border-radius: 8px;
          width: 400px;
          max-width: 90%;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          animation: slideIn 0.15s ease-out;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .dialog-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 20px 20px 16px 20px;
        }

        .header-icon {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .header-icon.danger {
          background: #fef2f2;
          color: #dc2626;
        }

        .header-icon.default {
          background: #f3f4f6;
          color: #6b7280;
        }

        .header-content {
          flex: 1;
          min-width: 0;
        }

        .dialog-title {
          font-size: 16px;
          font-weight: 600;
          color: rgba(0, 0, 0, 0.9);
          margin: 0 0 8px 0;
        }

        .dialog-message {
          font-size: 14px;
          color: rgba(0, 0, 0, 0.6);
          line-height: 1.5;
          margin: 0;
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
          flex-shrink: 0;
        }

        .close-button:hover {
          background: rgba(0, 0, 0, 0.05);
          color: rgba(0, 0, 0, 0.8);
        }

        .dialog-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 16px 20px 20px 20px;
          gap: 8px;
        }

        .button {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          border: none;
          outline: none;
        }

        .button:focus-visible {
          box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
        }

        .button-cancel {
          background: transparent;
          color: rgba(0, 0, 0, 0.7);
          border: 1px solid rgba(0, 0, 0, 0.2);
        }

        .button-cancel:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .button-confirm {
          background: #0078d4;
          color: white;
        }

        .button-confirm:hover {
          background: #106ebe;
        }

        .button-confirm.danger {
          background: #dc2626;
        }

        .button-confirm.danger:hover {
          background: #b91c1c;
        }
      `}</style>

      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <div className={`header-icon ${variant}`}>
            <AlertTriangle size={20} />
          </div>
          <div className="header-content">
            <h3 className="dialog-title">{title}</h3>
            <p className="dialog-message">{message}</p>
          </div>
          <button className="close-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="dialog-footer">
          <button className="button button-cancel" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={`button button-confirm ${variant}`}
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
