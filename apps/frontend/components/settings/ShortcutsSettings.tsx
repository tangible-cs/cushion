'use client';

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

  const conflictMap = useMemo(() => {
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
    return map;
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
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[var(--md-border)]">
        <div>
          <h2 className="text-base font-semibold">Shortcuts</h2>
          <p className="text-xs text-[var(--md-text-muted)] mt-1">
            Customize keyboard shortcuts used across the app.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-[var(--md-border)] text-[var(--md-text-muted)] hover:text-[var(--md-text)] hover:bg-[var(--md-bg-tertiary)] transition-colors"
        >
          <RotateCcw size={14} />
          Reset all
        </button>
      </div>

      <div className="px-6 py-3 border-b border-[var(--md-border)]">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--md-text-muted)]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shortcuts"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md bg-[var(--md-bg)] border border-[var(--md-border)] text-[var(--md-text)] placeholder:text-[var(--md-text-muted)] focus:outline-none focus:border-[var(--md-accent)]"
          />
        </div>
        {recordingId && (
          <div className="mt-2 text-xs text-[var(--md-text-muted)]">
            Recording shortcut... press a key combination.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {filteredGroups.map((group) => (
          <div key={group.category} className="px-6 py-4">
            <div className="text-xs uppercase tracking-wide text-[var(--md-text-faint)]">
              {group.category}
            </div>
            <div className="mt-2 divide-y divide-[var(--md-border)]">
              {group.shortcuts.map((shortcut) => {
                const bindings = resolvedBindings.get(shortcut.id) || [];
                const isRecording = recordingId === shortcut.id;
                const conflicts: ShortcutId[] = [];

                bindings.forEach((binding) => {
                  const normalized = normalizeShortcutForConflict(binding);
                  if (!normalized) return;
                  const conflictKey = `${shortcut.scope}:${normalized}`;
                  const matches = conflictMap.get(conflictKey) || [];
                  matches.forEach((id) => {
                    if (id !== shortcut.id && !conflicts.includes(id)) {
                      conflicts.push(id);
                    }
                  });
                });

                const conflictLabels = conflicts.map((id) => shortcutById.get(id)?.label ?? id);

                return (
                  <div
                    key={shortcut.id}
                    className={cn(
                      'flex items-start justify-between gap-4 py-3',
                      isRecording && 'bg-[var(--md-bg-tertiary)]/60 rounded-lg px-3 -mx-3'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--md-text)]">
                        {shortcut.label}
                      </div>
                      {shortcut.description && (
                        <div className="text-xs text-[var(--md-text-muted)] mt-1">
                          {shortcut.description}
                        </div>
                      )}
                      {conflicts.length > 0 && (
                        <div className="mt-1 text-xs text-red-400 flex items-start gap-1.5">
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
                          <span className="text-xs text-[var(--md-text-muted)]">Unassigned</span>
                        )}
                        {bindings.map((binding) => (
                          <span
                            key={binding}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--md-bg-tertiary)] text-xs text-[var(--md-text)]"
                          >
                            <kbd className="font-mono">{formatShortcut(binding)}</kbd>
                            <button
                              type="button"
                              onClick={() => removeBinding(shortcut.id, binding)}
                              className="text-[var(--md-text-muted)] hover:text-[var(--md-text)]"
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
                              ? 'border-[var(--md-accent)] text-[var(--md-accent)]'
                              : 'border-[var(--md-border)] text-[var(--md-text-muted)] hover:text-[var(--md-text)] hover:bg-[var(--md-bg-tertiary)]'
                          )}
                        >
                          <Plus size={12} />
                          {isRecording ? 'Recording' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => resetBindings(shortcut.id)}
                          className="px-2 py-1 text-xs rounded-md border border-[var(--md-border)] text-[var(--md-text-muted)] hover:text-[var(--md-text)] hover:bg-[var(--md-bg-tertiary)] transition-colors"
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
          <div className="p-8 text-sm text-[var(--md-text-muted)]">
            No shortcuts match your search.
          </div>
        )}
      </div>
    </div>
  );
}
