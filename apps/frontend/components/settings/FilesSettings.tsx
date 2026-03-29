
import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { DEFAULT_SETTINGS } from '@/lib/config-defaults';
import { cn } from '@/lib/utils';

interface FilesSettingsProps {
  embedded?: boolean;
}

export function FilesSettings({ embedded = false }: FilesSettingsProps) {
  const showCushionFiles = useWorkspaceStore((s) => s.preferences.showCushionFiles);
  const respectGitignore = useWorkspaceStore((s) => s.preferences.respectGitignore);
  const allowedExtensions = useWorkspaceStore((s) => s.preferences.allowedExtensions);
  const trashMethod = useWorkspaceStore((s) => s.preferences.trashMethod);
  const confirmSystemTrash = useWorkspaceStore((s) => s.preferences.confirmSystemTrash);
  const updatePreferences = useWorkspaceStore((s) => s.updatePreferences);
  const [dialogOpen, setDialogOpen] = useState(false);

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

      <ToggleRow
        label="Show .cushion folders"
        description="Display internal .cushion directories in the file browser"
        checked={showCushionFiles}
        onChange={() => updatePreferences({ showCushionFiles: !showCushionFiles })}
      />

      <ToggleRow
        label="Respect .gitignore"
        description="Hide files and folders matched by .gitignore patterns"
        checked={respectGitignore}
        onChange={() => updatePreferences({ respectGitignore: !respectGitignore })}
        className="mt-2"
      />

      <div className="flex items-center justify-between mt-4">
        <div>
          <div className="text-sm font-medium">Permitted file types</div>
          <div className="text-xs text-foreground-muted">
            {allowedExtensions.length} extension{allowedExtensions.length !== 1 && 's'} allowed
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary"
        >
          Manage
        </button>
      </div>

      <ToggleRow
        label="Use system trash"
        description="Move deleted files to the OS trash instead of Cushion's internal trash"
        checked={trashMethod === 'system'}
        onChange={() => updatePreferences({ trashMethod: trashMethod === 'system' ? 'cushion' : 'system' })}
        className="mt-2"
      />

      <ToggleRow
        label="Confirm before deleting"
        description="Show a confirmation dialog before moving files to the system trash"
        checked={confirmSystemTrash}
        onChange={() => updatePreferences({ confirmSystemTrash: !confirmSystemTrash })}
        className="mt-2"
        disabled={trashMethod !== 'system'}
      />

      {dialogOpen && (
        <PermittedTypesDialog onClose={() => setDialogOpen(false)} />
      )}
    </div>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  className,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex items-center justify-between gap-4 py-2', disabled && 'opacity-40 pointer-events-none', className)}>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-foreground-muted">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
          checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]'
        )}
      >
        <span
          className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function PermittedTypesDialog({ onClose }: { onClose: () => void }) {
  const allowedExtensions = useWorkspaceStore((s) => s.preferences.allowedExtensions);
  const updatePreferences = useWorkspaceStore((s) => s.updatePreferences);
  const [newExt, setNewExt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const addExtension = () => {
    let ext = newExt.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = '.' + ext;
    if (!allowedExtensions.includes(ext)) {
      updatePreferences({ allowedExtensions: [...allowedExtensions, ext] });
    }
    setNewExt('');
  };

  const removeExtension = (ext: string) => {
    updatePreferences({ allowedExtensions: allowedExtensions.filter((e) => e !== ext) });
  };

  const resetToDefaults = () => {
    updatePreferences({ allowedExtensions: [...DEFAULT_SETTINGS.allowedExtensions] });
  };

  const isDefault =
    allowedExtensions.length === DEFAULT_SETTINGS.allowedExtensions.length &&
    allowedExtensions.every((e) => DEFAULT_SETTINGS.allowedExtensions.includes(e));

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[460px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-foreground">Permitted file types</h3>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-foreground-muted px-5 mb-4">
          Only files with these extensions will appear in the file browser.
        </p>

        <form
          className="flex gap-2 px-5 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            addExtension();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={newExt}
            onChange={(e) => setNewExt(e.target.value)}
            placeholder="Add extension, e.g. .txt"
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-foreground-faint focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            type="submit"
            disabled={!newExt.trim()}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-background-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </form>

        <div className="flex flex-wrap gap-2 px-5 pb-5 max-h-[40vh] overflow-y-auto">
          {allowedExtensions.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-sm bg-background-secondary border border-border"
            >
              {ext}
              <button
                type="button"
                onClick={() => removeExtension(ext)}
                className="text-foreground-muted hover:text-foreground transition-colors rounded hover:bg-background p-0.5"
                aria-label={`Remove ${ext}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </span>
          ))}
        </div>

        <div className="flex justify-end px-5 pb-5">
          <button
            type="button"
            onClick={resetToDefaults}
            disabled={isDefault}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
