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
    <div
      className="fixed inset-0 z-workspace-modal flex items-stretch justify-stretch animate-fade-in"
      onClick={(e) => {
        if (!allowClose) return;
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-transparent w-full h-full overflow-hidden animate-slide-up">
        <div className="relative h-full">
          {allowClose && (
            <button
              className="absolute top-5 right-6 w-[38px] h-[38px] rounded-xl bg-surface border border-border cursor-pointer flex items-center justify-center transition-all text-foreground shadow-sm hover:bg-background hover:shadow-md hover:-translate-y-px"
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
  );
}
