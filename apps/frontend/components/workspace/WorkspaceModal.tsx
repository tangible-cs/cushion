'use client';

import { WorkspacePicker } from './WorkspacePicker';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceModal({ isOpen, onClose }: WorkspaceModalProps) {
  const allowClose = useWorkspaceStore((state) => !!state.metadata);

  if (!isOpen) return null;

  return (
    <>
      <style jsx>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
          background: transparent;
          width: 100%;
          height: 100%;
          overflow: hidden;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .close-button {
          position: absolute;
          top: 20px;
          right: 24px;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid rgba(15, 23, 42, 0.12);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          color: #0f172a;
          backdrop-filter: blur(8px);
        }

        .close-button:hover {
          background: rgba(255, 255, 255, 0.95);
          border-color: rgba(15, 23, 42, 0.2);
          transform: translateY(-1px);
        }

        .modal-content-wrapper {
          position: relative;
          height: 100%;
        }
      `}</style>

        <div
          className="modal-overlay"
          onClick={(e) => {
            if (!allowClose) return;
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          <div className="modal-content">
            <div className="modal-content-wrapper">
            {allowClose && (
              <button
                className="close-button"
                onClick={onClose}
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            <WorkspacePicker onWorkspaceOpened={onClose} />
          </div>
        </div>
      </div>
    </>
  );
}
