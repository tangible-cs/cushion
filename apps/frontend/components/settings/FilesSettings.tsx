'use client';

import { useWorkspaceStore } from '@/stores/workspaceStore';

export function FilesSettings() {
  const showCushionFiles = useWorkspaceStore((s) => s.preferences.showCushionFiles);
  const updatePreferences = useWorkspaceStore((s) => s.updatePreferences);

  return (
    <div className="p-6 overflow-y-auto">
      <h2 className="text-base font-semibold mb-4">Files</h2>

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
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
            showCushionFiles ? 'bg-foreground' : 'bg-border'
          }`}
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
