
import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, X } from 'lucide-react';
import { searchFiles, flattenFileTree } from '@/lib/wiki-link-resolver';
import type { FileTreeNode } from '@cushion/types';
import { formatShortcutList, matchShortcut, useShortcutBindings } from '@/lib/shortcuts';
import { getBaseName, getDirectory } from '@/lib/path-utils';
import { cn } from '@/lib/utils';

interface QuickSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  fileTree: FileTreeNode[];
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

/**
 * Find indices where query characters match in the text (for highlighting).
 */
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

/**
 * Render text with highlighted characters.
 */
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H7.08579C7.35097 3.5 7.60536 3.60536 7.79289 3.79289L9.20711 5.20711C9.39464 5.39464 9.64903 5.5 9.91421 5.5H15.5C16.6046 5.5 17.5 6.39543 17.5 7.5V14.5C17.5 15.6046 16.6046 16.5 15.5 16.5H4.5C3.39543 16.5 2.5 15.6046 2.5 14.5V5.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path
        d="M5 3.5C4.72386 3.5 4.5 3.72386 4.5 4V16C4.5 16.2761 4.72386 16.5 5 16.5H15C15.2761 16.5 15.5 16.2761 15.5 16V7.41421C15.5 7.28161 15.4473 7.15443 15.3536 7.06066L11.9393 3.64645C11.8456 3.55268 11.7184 3.5 11.5858 3.5H5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 3.5V7C11.5 7.27614 11.7239 7.5 12 7.5H15.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuickSwitcher({
  isOpen,
  onClose,
  fileTree,
  onSelectFile,
  onCreateFile,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const quickSwitcherShortcuts = useShortcutBindings(QUICK_SWITCHER_SHORTCUT_IDS);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search results
  const results = useMemo((): SearchResult[] => {
    const items: SearchResult[] = [];

    if (query.trim()) {
      const matches = searchFiles(query, fileTree, 15);

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
      const allFiles = flattenFileTree(fileTree);
      const sorted = allFiles
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
  }, [query, fileTree, onCreateFile]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedItem = list.children[selectedIndex] as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle keyboard navigation
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

  // Handle item click
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
        className="flex h-[480px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
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

        {/* Search bar */}
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

        {/* Results */}
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
                    ) : item.directory ? (
                      <FolderIcon />
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

        {/* Footer shortcuts */}
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
