
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw, Search, Plus, X } from 'lucide-react';
import { shortcutRegistry, type ShortcutDefinition, type ShortcutId } from '@/lib/shortcuts/registry';
import {
  formatShortcut,
  normalizeShortcut,
  normalizeShortcutForConflict,
  shortcutFromEvent,
} from '@/lib/shortcuts/utils';
import { resolveBindings, useShortcutsStore } from '@/stores/shortcutsStore';
import { cn } from '@/lib/utils';

const shortcutById = new Map<ShortcutId, ShortcutDefinition>(
  shortcutRegistry.map((shortcut) => [shortcut.id, shortcut])
);

export function ShortcutsSettings() {
  const overrides = useShortcutsStore((state) => state.overrides);
  const setBindings = useShortcutsStore((state) => state.setBindings);
  const resetBindings = useShortcutsStore((state) => state.resetBindings);
  const resetAll = useShortcutsStore((state) => state.resetAll);
  const [query, setQuery] = useState('');
  const [recordingId, setRecordingId] = useState<ShortcutId | null>(null);

  const resolvedBindings = useMemo(() => {
    const map = new Map<ShortcutId, string[]>();
    shortcutRegistry.forEach((shortcut) => {
      map.set(shortcut.id, resolveBindings(shortcut.id, overrides));
    });
    return map;
  }, [overrides]);

  const { conflictsPerShortcut } = useMemo(() => {
    const map = new Map<string, ShortcutId[]>();
    shortcutRegistry.forEach((shortcut) => {
      const bindings = resolvedBindings.get(shortcut.id) || [];
        bindings.forEach((binding) => {
          const normalized = normalizeShortcutForConflict(binding);
          if (!normalized) return;
          const key = `${shortcut.scope}:${normalized}`;
          const list = map.get(key) || [];
          map.set(key, [...list, shortcut.id]);
        });
    });

    // Pre-compute conflicts per shortcut
    const perShortcut = new Map<ShortcutId, ShortcutId[]>();
    shortcutRegistry.forEach((shortcut) => {
      const bindings = resolvedBindings.get(shortcut.id) || [];
      const conflicts: ShortcutId[] = [];
      bindings.forEach((binding) => {
        const normalized = normalizeShortcutForConflict(binding);
        if (!normalized) return;
        const conflictKey = `${shortcut.scope}:${normalized}`;
        const matches = map.get(conflictKey) || [];
        matches.forEach((id) => {
          if (id !== shortcut.id && !conflicts.includes(id)) {
            conflicts.push(id);
          }
        });
      });
      if (conflicts.length > 0) perShortcut.set(shortcut.id, conflicts);
    });

    return { conflictMap: map, conflictsPerShortcut: perShortcut };
  }, [resolvedBindings]);

  const filteredGroups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const items = term
      ? shortcutRegistry.filter((shortcut) => {
          const haystack = [
            shortcut.label,
            shortcut.description || '',
            shortcut.category,
            shortcut.id,
          ].join(' ').toLowerCase();
          return haystack.includes(term);
        })
      : shortcutRegistry;

    const groups = new Map<string, ShortcutDefinition[]>();
    items.forEach((shortcut) => {
      const list = groups.get(shortcut.category) || [];
      groups.set(shortcut.category, [...list, shortcut]);
    });

    return Array.from(groups.entries()).map(([category, shortcuts]) => ({
      category,
      shortcuts,
    }));
  }, [query]);

  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      const normalized = normalizeShortcut(shortcut);
      if (!normalized) return;
      const current = resolvedBindings.get(recordingId) || [];
      setBindings(recordingId, [...current, normalized]);
      setRecordingId(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [recordingId, resolvedBindings, setBindings]);

  const removeBinding = (id: ShortcutId, binding: string) => {
    const current = resolvedBindings.get(id) || [];
    const normalized = normalizeShortcut(binding);
    const next = current.filter((item) => normalizeShortcut(item) !== normalized);
    setBindings(id, next);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shortcuts"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]"
          />
        </div>
        {recordingId && (
          <div className="mt-2 text-xs text-foreground-muted">
            Recording shortcut... press a key combination.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto thin-scrollbar">
        <div className="px-6 pt-3 pb-1 flex justify-end">
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-colors"
          >
            <RotateCcw size={14} />
            Reset all
          </button>
        </div>
        {filteredGroups.map((group) => (
          <div key={group.category} className="px-6 py-4">
            <div className="text-xs uppercase tracking-wide text-foreground-faint">
              {group.category}
            </div>
            <div className="mt-2 divide-y divide-border">
              {group.shortcuts.map((shortcut) => {
                const bindings = resolvedBindings.get(shortcut.id) || [];
                const isRecording = recordingId === shortcut.id;
                const conflicts = conflictsPerShortcut.get(shortcut.id) || [];
                const conflictLabels = conflicts.map((id) => shortcutById.get(id)?.label ?? id);

                return (
                  <div
                    key={shortcut.id}
                    className={cn(
                      'flex items-start justify-between gap-4 py-3',
                      isRecording && 'bg-surface-tertiary/60 rounded-lg px-3 -mx-3'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {shortcut.label}
                      </div>
                      {shortcut.description && (
                        <div className="text-xs text-foreground-muted mt-1">
                          {shortcut.description}
                        </div>
                      )}
                      {conflicts.length > 0 && (
                        <div className="mt-1 text-xs text-accent-red flex items-start gap-1.5">
                          <AlertTriangle size={12} className="mt-0.5" />
                          <span>
                            Conflicts with {conflictLabels.length === 1 ? 'shortcut' : 'shortcuts'}: {' '}
                            {conflictLabels.join(', ')}.
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="flex flex-wrap gap-1 justify-end">
                        {bindings.length === 0 && (
                          <span className="text-xs text-foreground-muted">Unassigned</span>
                        )}
                        {bindings.map((binding) => (
                          <span
                            key={binding}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-tertiary text-xs text-foreground"
                          >
                            <kbd className="font-mono">{formatShortcut(binding)}</kbd>
                            <button
                              type="button"
                              onClick={() => removeBinding(shortcut.id, binding)}
                              className="text-foreground-muted hover:text-foreground"
                              aria-label="Remove shortcut"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRecordingId(isRecording ? null : shortcut.id)}
                          className={cn(
                            'flex items-center gap-1.5 px-2 py-1 text-xs rounded-md border transition-colors',
                            isRecording
                              ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
                              : 'border-border text-foreground-muted hover:text-foreground hover:bg-surface-tertiary'
                          )}
                        >
                          <Plus size={12} />
                          {isRecording ? 'Recording' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => resetBindings(shortcut.id)}
                          className="px-2 py-1 text-xs rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-colors"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div className="p-8 text-sm text-foreground-muted">
            No shortcuts match your search.
          </div>
        )}
      </div>
    </div>
  );
}
