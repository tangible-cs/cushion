
import { useWorkspacePicker } from './WorkspacePicker';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { FolderOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceModal({ isOpen, onClose }: WorkspaceModalProps) {
  const allowClose = useWorkspaceStore((state) => !!state.metadata);
  const recentProjects = useWorkspaceStore((state) => state.recentProjects);
  const { isOpening, error, handleBrowse, handleOpenRecent } = useWorkspacePicker(onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)] p-4"
      onClick={(e) => {
        if (!allowClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-xl bg-modal-bg text-foreground shadow-[var(--shadow-lg)] border border-modal-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderOpen size={16} className="text-foreground-muted" />
            <span className="text-sm font-semibold">Open Workspace</span>
          </div>
          {allowClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-4">
          {/* Browse button */}
          <button
            onClick={handleBrowse}
            disabled={isOpening}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-none',
              'bg-accent text-white text-sm font-medium',
              'transition-all duration-150 cursor-pointer',
              'hover:bg-accent-hover',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <FolderOpen size={15} />
            {isOpening ? 'Opening…' : 'Browse for Folder'}
          </button>

          {error && (
            <div className="px-3 py-2 rounded-lg border border-[var(--accent-red)] bg-[var(--accent-red-12)] text-[var(--accent-red)] text-xs">
              {error}
            </div>
          )}

          {/* Recent projects */}
          {recentProjects.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground-muted mb-1.5 px-1">
                Recent
              </div>
              <div className="flex flex-col gap-0.5">
                {recentProjects.slice(0, 5).map((project) => (
                  <button
                    key={project.projectPath}
                    onClick={() => handleOpenRecent(project.projectPath)}
                    disabled={isOpening}
                    className={cn(
                      'flex flex-col px-3 py-2 rounded-md text-left',
                      'bg-transparent cursor-pointer border-none',
                      'transition-colors duration-100',
                      'hover:bg-[var(--overlay-10)]',
                      'disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <span className="text-sm font-medium text-foreground">
                      {project.projectName}
                    </span>
                    <span className="text-[11px] text-foreground-muted break-all mt-0.5">
                      {project.projectPath}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
