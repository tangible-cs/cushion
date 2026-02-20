'use client';

import { useWorkspaceStore } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';

interface FilesSettingsProps {
  embedded?: boolean;
}

export function FilesSettings({ embedded = false }: FilesSettingsProps) {
  const showCushionFiles = useWorkspaceStore((s) => s.preferences.showCushionFiles);
  const updatePreferences = useWorkspaceStore((s) => s.updatePreferences);

  return (
    <div className={cn(embedded ? 'px-6 py-4 border-b border-border' : 'p-6 overflow-y-auto')}>
      <h2
        className={cn(
          embedded
            ? 'text-xs uppercase tracking-wide text-foreground-faint mb-3'
            : 'text-base font-semibold mb-4'
        )}
      >
        Files
      </h2>

      <label className="flex items-center justify-between gap-4 py-2">
        <div>
          <div className="text-sm font-medium">Show .cushion folders</div>
          <div className="text-xs text-foreground-muted">
            Display internal .cushion directories (e.g. pasted images) in the file browser
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showCushionFiles}
          onClick={() => updatePreferences({ showCushionFiles: !showCushionFiles })}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
            showCushionFiles ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]'
          )}
        >
          <span
            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
              showCushionFiles ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </label>
    </div>
  );
}
