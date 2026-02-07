'use client';

import { useMemo } from 'react';
import { ArrowLeft, FileText, Link2 } from 'lucide-react';
import type { LinkInfo, LinkIndex } from '@/lib/link-index';
import { getBacklinks } from '@/lib/link-index';

interface BacklinksPanelProps {
  /** Current file path */
  currentFile: string | null;
  /** Link index containing all connections */
  linkIndex: LinkIndex | null;
  /** Callback when a backlink is clicked */
  onNavigate: (filePath: string) => void;
}

/**
 * Get filename without extension for display.
 */
function getDisplayName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/**
 * Highlight the wiki-link in the context text.
 */
function highlightContext(context: string, href: string): React.ReactNode {
  // Find the wiki-link pattern
  const pattern = new RegExp(`\\[\\[${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(#[^\\]|]*)?((\\|[^\\]]*)?)?\\]\\]`, 'i');
  const match = context.match(pattern);
  
  if (!match) {
    return context;
  }
  
  const index = match.index!;
  const before = context.slice(0, index);
  const link = match[0];
  const after = context.slice(index + link.length);
  
  return (
    <>
      {before}
      <span className="text-[var(--md-accent)] font-medium">{link}</span>
      {after}
    </>
  );
}

export function BacklinksPanel({ currentFile, linkIndex, onNavigate }: BacklinksPanelProps) {
  // Get backlinks for current file
  const backlinks = useMemo(() => {
    if (!currentFile || !linkIndex) return [];
    return getBacklinks(linkIndex, currentFile);
  }, [currentFile, linkIndex]);
  
  // Group backlinks by source file
  const groupedBacklinks = useMemo(() => {
    const groups = new Map<string, LinkInfo[]>();
    
    for (const link of backlinks) {
      if (!groups.has(link.from)) {
        groups.set(link.from, []);
      }
      groups.get(link.from)!.push(link);
    }
    
    // Sort by file name
    return Array.from(groups.entries()).sort((a, b) => 
      getDisplayName(a[0]).localeCompare(getDisplayName(b[0]))
    );
  }, [backlinks]);
  
  if (!currentFile) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--md-text-muted)] text-sm">
        Open a file to see backlinks
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-[var(--md-bg-secondary)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--md-border)]">
        <Link2 size={16} className="text-[var(--md-accent)]" />
        <span className="font-medium text-sm">Backlinks</span>
        <span className="ml-auto text-xs text-[var(--md-text-muted)] bg-[var(--md-bg-tertiary)] px-2 py-0.5 rounded-full">
          {backlinks.length}
        </span>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto thin-scrollbar">
        {groupedBacklinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--md-text-muted)] text-sm p-4">
            <ArrowLeft size={32} className="mb-2 opacity-30" />
            <p>No incoming links</p>
            <p className="text-xs mt-1 opacity-70">
              Other files linking to this one will appear here
            </p>
          </div>
        ) : (
          <div className="p-2">
            {groupedBacklinks.map(([fromFile, links]) => (
              <div key={fromFile} className="mb-3">
                {/* Source file header */}
                <button
                  onClick={() => onNavigate(fromFile)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--md-bg-tertiary)] transition-colors text-left group"
                >
                  <FileText size={14} className="text-[var(--md-text-muted)] group-hover:text-[var(--md-accent)]" />
                  <span className="font-medium text-sm group-hover:text-[var(--md-accent)]">
                    {getDisplayName(fromFile)}
                  </span>
                  <span className="ml-auto text-xs text-[var(--md-text-faint)]">
                    {links.length} {links.length === 1 ? 'link' : 'links'}
                  </span>
                </button>
                
                {/* Context previews */}
                <div className="ml-6 mt-1 space-y-1">
                  {links.map((link, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate(fromFile)}
                      className="w-full text-left px-3 py-1.5 text-xs text-[var(--md-text-muted)] hover:text-[var(--md-text)] hover:bg-[var(--md-bg-tertiary)] rounded transition-colors line-clamp-2"
                    >
                      <span className="text-[var(--md-text-faint)] mr-2">L{link.line}</span>
                      {highlightContext(link.context, link.href)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
