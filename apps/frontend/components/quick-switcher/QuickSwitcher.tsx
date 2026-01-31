'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { FileText, FilePlus, Folder } from 'lucide-react';
import { searchFiles, flattenFileTree } from '@/lib/wiki-link-resolver';
import type { FileTreeNode } from '@cushion/types';

interface QuickSwitcherProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** File tree for searching */
  fileTree: FileTreeNode[];
  /** Callback when a file is selected */
  onSelectFile: (filePath: string) => void;
  /** Callback to create a new file */
  onCreateFile?: (fileName: string) => void;
}

/** A search result item */
interface SearchResult {
  type: 'file' | 'create';
  path: string;
  displayName: string;
  directory: string;
  matchIndices?: number[];
}

/**
 * Get the filename without extension.
 */
function getDisplayName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/**
 * Get the directory part of a path.
 */
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
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
      <span key={`h-${idx}`} className="text-[var(--md-accent)] font-semibold">
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
  fileTree,
  onSelectFile,
  onCreateFile,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Small delay to ensure the modal is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Search results
  const results = useMemo((): SearchResult[] => {
    const items: SearchResult[] = [];
    
    if (query.trim()) {
      // Search with query
      const matches = searchFiles(query, fileTree, 15);
      
      for (const path of matches) {
        const displayName = getDisplayName(path);
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
      
      // Add "Create new file" option if query doesn't exactly match a file
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
      // Show recent/all files when no query
      const allFiles = flattenFileTree(fileTree);
      // Sort by modification time would be ideal, but we just show first 15 for now
      // Prefer .md files
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
          displayName: getDisplayName(path),
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
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => (i + 1) % Math.max(1, results.length));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => (i - 1 + results.length) % Math.max(1, results.length));
          break;
        case 'Enter':
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
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          // Autocomplete with selected item
          e.preventDefault();
          const tabSelected = results[selectedIndex];
          if (tabSelected && tabSelected.type === 'file') {
            setQuery(tabSelected.displayName);
          }
          break;
      }
    },
    [results, selectedIndex, onSelectFile, onCreateFile, onClose]
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-[var(--md-bg)] rounded-xl shadow-2xl border border-[var(--md-border)] overflow-hidden"
        style={{ maxHeight: '60vh' }}
      >
        {/* Search input */}
        <div className="p-3 border-b border-[var(--md-border)]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type to search for a file..."
            className="w-full px-3 py-2 bg-[var(--md-bg-secondary)] rounded-lg border border-[var(--md-border)] text-[var(--md-text)] placeholder:text-[var(--md-text-muted)] focus:outline-none focus:border-[var(--md-accent)] text-base"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </div>
        
        {/* Results list */}
        <div
          ref={listRef}
          className="overflow-y-auto"
          style={{ maxHeight: 'calc(60vh - 70px)' }}
        >
          {results.length === 0 ? (
            <div className="p-6 text-center text-[var(--md-text-muted)]">
              No files found. Try a different search.
            </div>
          ) : (
            results.map((item, index) => (
              <div
                key={item.type === 'create' ? `create-${item.path}` : item.path}
                className={`
                  flex items-center gap-3 px-4 py-2.5 cursor-pointer
                  ${index === selectedIndex
                    ? 'bg-[var(--md-accent)] text-white'
                    : 'hover:bg-[var(--md-bg-secondary)]'
                  }
                `}
                onClick={() => handleItemClick(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {/* Icon */}
                <div className={`flex-shrink-0 ${index === selectedIndex ? 'text-white' : 'text-[var(--md-text-muted)]'}`}>
                  {item.type === 'create' ? (
                    <FilePlus size={18} />
                  ) : item.path.endsWith('.md') ? (
                    <FileText size={18} />
                  ) : (
                    <Folder size={18} />
                  )}
                </div>
                
                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="truncate">
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
                    <div
                      className={`text-xs truncate ${
                        index === selectedIndex ? 'text-white/70' : 'text-[var(--md-text-muted)]'
                      }`}
                    >
                      {item.directory}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        {/* Footer with shortcuts */}
        <div className="px-4 py-2 border-t border-[var(--md-border)] flex gap-4 text-xs text-[var(--md-text-muted)]">
          <span><kbd className="px-1 py-0.5 bg-[var(--md-bg-secondary)] rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--md-bg-secondary)] rounded">Enter</kbd> Open</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--md-bg-secondary)] rounded">Tab</kbd> Autocomplete</span>
          <span><kbd className="px-1 py-0.5 bg-[var(--md-bg-secondary)] rounded">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
