'use client';

import { useWorkspaceStore } from '@/stores/workspaceStore';
import { cn } from '@/lib/utils';

interface EditorSettingsProps {
  embedded?: boolean;
}

const toggles = [
  {
    key: 'showLineNumber' as const,
    label: 'Show line numbers',
    description: 'Show line numbers in the editor gutter',
  },
  {
    key: 'spellcheck' as const,
    label: 'Spellcheck',
    description: 'Enable browser spellcheck in the editor',
  },
  {
    key: 'readableLineLength' as const,
    label: 'Readable line length',
    description: 'Limit editor width for better readability',
  },
  {
    key: 'autoPairBrackets' as const,
    label: 'Auto-pair brackets & markdown',
    description: 'Automatically close brackets, parentheses, and markdown syntax',
  },
  {
    key: 'foldHeading' as const,
    label: 'Fold headings',
    description: 'Allow folding content under heading levels',
  },
  {
    key: 'foldIndent' as const,
    label: 'Fold indentation',
    description: 'Allow folding content by indentation level',
  },
];

export function EditorSettings({ embedded = false }: EditorSettingsProps) {
  const preferences = useWorkspaceStore((s) => s.preferences);
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
        Editor
      </h2>

      {toggles.map(({ key, label, description }) => (
        <label key={key} className="flex items-center justify-between gap-4 py-2">
          <div>
            <div className="text-sm font-medium">{label}</div>
            <div className="text-xs text-foreground-muted">{description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences[key]}
            onClick={() => updatePreferences({ [key]: !preferences[key] })}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
              preferences[key] ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]'
            )}
          >
            <span
              className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
                preferences[key] ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      ))}
    </div>
  );
}
