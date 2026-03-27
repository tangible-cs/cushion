
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X } from 'lucide-react';
import { searchFiles } from '@/lib/wiki-link-resolver';
import { formatShortcutList, matchShortcut, useShortcutBindings } from '@/lib/shortcuts';
import { getBaseName, getDirectory } from '@/lib/path-utils';
import { cn } from '@/lib/utils';
import { FileIcon } from '@/components/shared/FileIcons';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  filePaths: string[];
  onSelectFile: (filePath: string) => void;
  onCreateFile?: (fileName: string) => void;
}

const QUICK_SWITCHER_SHORTCUT_IDS = [
  'quickSwitcher.navigateNext',
  'quickSwitcher.navigatePrev',
  'quickSwitcher.open',
  'quickSwitcher.autocomplete',
  'app.overlay.close',
] as const;

interface SearchResult {
  type: 'file' | 'create';
  path: string;
  displayName: string;
  directory: string;
  matchIndices?: number[];
}

function findMatchIndices(text: string, query: string): number[] {
  const indices: number[] = [];
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  let queryIndex = 0;
  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      indices.push(i);
      queryIndex++;
    }
  }

  return indices;
}

function HighlightedText({ text, matchIndices }: { text: string; matchIndices?: number[] }) {
  if (!matchIndices || matchIndices.length === 0) {
    return <span>{text}</span>;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const idx of matchIndices) {
    if (idx > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, idx)}</span>);
    }
    parts.push(
      <span key={`h-${idx}`} className="text-foreground font-semibold">
        {text[idx]}
      </span>
    );
    lastIndex = idx + 1;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}


export function QuickSwitcher({
  isOpen,
  onClose,
  filePaths,
  onSelectFile,
  onCreateFile,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const quickSwitcherShortcuts = useShortcutBindings(QUICK_SWITCHER_SHORTCUT_IDS);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = useMemo((): SearchResult[] => {
    const items: SearchResult[] = [];

    if (query.trim()) {
      const matches = searchFiles(query, filePaths, 15);

      for (const path of matches) {
        const displayName = getBaseName(path);
        const directory = getDirectory(path);
        const matchIndices = findMatchIndices(displayName, query);

        items.push({
          type: 'file',
          path,
          displayName,
          directory,
          matchIndices,
        });
      }

      const queryLower = query.toLowerCase();
      const exactMatch = items.some(
        item => item.displayName.toLowerCase() === queryLower
      );

      if (!exactMatch && onCreateFile) {
        items.push({
          type: 'create',
          path: query.includes('.') ? query : `${query}.md`,
          displayName: query,
          directory: '',
        });
      }
    } else {
      const sorted = filePaths
        .sort((a, b) => {
          const aIsMd = a.endsWith('.md') ? 1 : 0;
          const bIsMd = b.endsWith('.md') ? 1 : 0;
          return bIsMd - aIsMd;
        })
        .slice(0, 15);

      for (const path of sorted) {
        items.push({
          type: 'file',
          path,
          displayName: getBaseName(path),
          directory: getDirectory(path),
        });
      }
    }

    return items;
  }, [query, filePaths, onCreateFile]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (matchShortcut(e.nativeEvent, quickSwitcherShortcuts['quickSwitcher.navigateNext'])) {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(1, results.length));
        return;
      }

      if (matchShortcut(e.nativeEvent, quickSwitcherShortcuts['quickSwitcher.navigatePrev'])) {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + results.length) % Math.max(1, results.length));
        return;
      }

      if (matchShortcut(e.nativeEvent, quickSwitcherShortcuts['quickSwitcher.open'])) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          if (selected.type === 'create' && onCreateFile) {
            onCreateFile(selected.path);
          } else {
            onSelectFile(selected.path);
          }
          onClose();
        }
        return;
      }

      if (matchShortcut(e.nativeEvent, quickSwitcherShortcuts['quickSwitcher.autocomplete'])) {
        e.preventDefault();
        const tabSelected = results[selectedIndex];
        if (tabSelected && tabSelected.type === 'file') {
          setQuery(tabSelected.displayName);
        }
        return;
      }

      if (matchShortcut(e.nativeEvent, quickSwitcherShortcuts['app.overlay.close'])) {
        e.preventDefault();
        onClose();
      }
    },
    [results, selectedIndex, onSelectFile, onCreateFile, onClose, quickSwitcherShortcuts]
  );

  const handleItemClick = useCallback(
    (item: SearchResult) => {
      if (item.type === 'create' && onCreateFile) {
        onCreateFile(item.path);
      } else {
        onSelectFile(item.path);
      }
      onClose();
    },
    [onSelectFile, onCreateFile, onClose]
  );

  const nextLabel = formatShortcutList(quickSwitcherShortcuts['quickSwitcher.navigateNext']);
  const prevLabel = formatShortcutList(quickSwitcherShortcuts['quickSwitcher.navigatePrev']);
  const openLabel = formatShortcutList(quickSwitcherShortcuts['quickSwitcher.open']);
  const autocompleteLabel = formatShortcutList(quickSwitcherShortcuts['quickSwitcher.autocomplete']);
  const closeLabel = formatShortcutList(quickSwitcherShortcuts['app.overlay.close']);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)] p-4" onClick={onClose}>
      <div
        className="flex h-[480px] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-modal-border bg-modal-bg shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-medium text-foreground">Quick switcher</h2>
          <button
            type="button"
            onClick={onClose}
            className="size-6 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex h-8 items-center gap-2 rounded-md bg-surface px-2">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search files..."
              className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="size-5 flex items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No files found
            </div>
          ) : (
            <div ref={listRef} className="space-y-0.5">
              {results.map((item, index) => (
                <div
                  key={item.type === 'create' ? `create-${item.path}` : item.path}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors',
                    index === selectedIndex
                      ? 'bg-[var(--overlay-10)] text-foreground'
                      : 'hover:bg-[var(--overlay-10)]'
                  )}
                  onClick={() => handleItemClick(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className={cn('shrink-0', index === selectedIndex ? 'text-foreground' : 'text-muted-foreground')}>
                    {item.type === 'create' ? (
                      <Plus size={20} />
                    ) : (
                      <FileIcon />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] text-foreground">
                      {item.type === 'create' ? (
                        <span>
                          Create "<span className="font-medium">{item.displayName}</span>"
                        </span>
                      ) : (
                        <HighlightedText
                          text={item.displayName}
                          matchIndices={index === selectedIndex ? undefined : item.matchIndices}
                        />
                      )}
                    </div>
                    {item.directory && (
                      <div className="truncate text-xs text-muted-foreground">
                        {item.directory}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2.5 flex gap-4 text-xs text-muted-foreground">
          {(prevLabel || nextLabel) && (
            <span>
              {prevLabel && <kbd className="px-1 py-0.5 rounded bg-surface text-[11px]">{prevLabel}</kbd>}
              {nextLabel && <kbd className="px-1 py-0.5 rounded bg-surface text-[11px] ml-1">{nextLabel}</kbd>}
              {' '}Navigate
            </span>
          )}
          {openLabel && <span><kbd className="px-1 py-0.5 rounded bg-surface text-[11px]">{openLabel}</kbd> Open</span>}
          {autocompleteLabel && <span><kbd className="px-1 py-0.5 rounded bg-surface text-[11px]">{autocompleteLabel}</kbd> Autocomplete</span>}
          {closeLabel && <span><kbd className="px-1 py-0.5 rounded bg-surface text-[11px]">{closeLabel}</kbd> Close</span>}
        </div>
      </div>
    </div>,
    document.body
  );
}
