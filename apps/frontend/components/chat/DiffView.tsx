'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { File as FileIcon, Minus, Plus } from 'lucide-react';
import type { FileDiff } from '@opencode-ai/sdk/v2/client';
import * as DiffLib from 'diff';
import { Icon } from './Icon';
import { getDirectory, getFilename } from '@/lib/path-utils';

type DiffLine = {
  type: 'addition' | 'deletion' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
};

type DiffHunk = {
  startIndex: number;
  endIndex: number;
  addedLines: number;
  removedLines: number;
};

function computeDiffLines(before: string, after: string): DiffLine[] {
  const diff = DiffLib.diffLines(before, after);
  const result: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of diff) {
    const lines = change.value.split('\n');
    const type = change.added
      ? 'addition'
      : change.removed
        ? 'deletion'
        : 'context';

    for (let i = 0; i < lines.length; i++) {
      const content = lines[i];
      if (i === lines.length - 1 && content === '') continue;

      if (type === 'addition') {
        result.push({
          type: 'addition',
          content,
          newLineNumber: newLineNum++,
        });
      } else if (type === 'deletion') {
        result.push({
          type: 'deletion',
          content,
          oldLineNumber: oldLineNum++,
        });
      } else {
        result.push({
          type: 'context',
          content,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  return result;
}

function computeDiffHunks(lines: DiffLine[], contextLines: number = 3): { hunks: DiffHunk[]; visibleLines: Set<number> } {
  const hunks: DiffHunk[] = [];
  const visibleLines = new Set<number>();
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isChange = line.type === 'addition' || line.type === 'deletion';

    if (isChange) {
      if (!currentHunk) {
        currentHunk = {
          startIndex: Math.max(0, i - contextLines),
          endIndex: i,
          addedLines: 0,
          removedLines: 0,
        };
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          visibleLines.add(j);
        }
      }
      currentHunk.endIndex = i;
      if (line.type === 'addition') currentHunk.addedLines++;
      else currentHunk.removedLines++;
      visibleLines.add(i);
    } else if (currentHunk) {
      const contextAfter = contextLines;
      const endIndex = Math.min(lines.length - 1, i + contextAfter);
      if (endIndex > currentHunk.endIndex) {
        currentHunk.endIndex = endIndex;
        for (let j = i; j <= endIndex; j++) {
          visibleLines.add(j);
        }
        i = endIndex;
      }
      hunks.push(currentHunk);
      currentHunk = null;
    }
  }

  if (currentHunk) {
    for (let j = currentHunk.endIndex + 1; j < Math.min(lines.length, currentHunk.endIndex + 1 + contextLines); j++) {
      visibleLines.add(j);
      currentHunk.endIndex = j;
    }
    hunks.push(currentHunk);
  }

  return { hunks, visibleLines };
}

type DiffChangesProps = {
  changes: { additions: number; deletions: number } | { additions: number; deletions: number }[];
  variant?: 'default' | 'bars';
  className?: string;
};

function DiffChanges({ changes, variant = 'default', className }: DiffChangesProps) {
  const additions = Array.isArray(changes)
    ? changes.reduce((acc, diff) => acc + (diff.additions ?? 0), 0)
    : changes.additions ?? 0;
  const deletions = Array.isArray(changes)
    ? changes.reduce((acc, diff) => acc + (diff.deletions ?? 0), 0)
    : changes.deletions ?? 0;
  const total = additions + deletions;

  if (variant === 'default' && total <= 0) return null;

  const TOTAL_BLOCKS = 5;
  const computeBlocks = () => {
    if (additions === 0 && deletions === 0) {
      return { added: 0, deleted: 0, neutral: TOTAL_BLOCKS };
    }
    const sum = additions + deletions;
    if (sum < 5) {
      const added = additions > 0 ? 1 : 0;
      const deleted = deletions > 0 ? 1 : 0;
      const neutral = TOTAL_BLOCKS - added - deleted;
      return { added, deleted, neutral };
    }
    const ratio = additions > deletions ? additions / Math.max(1, deletions) : deletions / Math.max(1, additions);
    const blocksForColors = sum < 20 || ratio < 4 ? TOTAL_BLOCKS - 1 : TOTAL_BLOCKS;
    const percentAdded = additions / sum;
    const percentDeleted = deletions / sum;
    const addedRaw = percentAdded * blocksForColors;
    const deletedRaw = percentDeleted * blocksForColors;
    let added = additions > 0 ? Math.max(1, Math.round(addedRaw)) : 0;
    let deleted = deletions > 0 ? Math.max(1, Math.round(deletedRaw)) : 0;
    if (additions > 0 && additions <= 5) added = Math.min(added, 1);
    if (additions > 5 && additions <= 10) added = Math.min(added, 2);
    if (deletions > 0 && deletions <= 5) deleted = Math.min(deleted, 1);
    if (deletions > 5 && deletions <= 10) deleted = Math.min(deleted, 2);
    let allocated = added + deleted;
    if (allocated > blocksForColors) {
      if (addedRaw > deletedRaw) {
        added = blocksForColors - deleted;
      } else {
        deleted = blocksForColors - added;
      }
      allocated = added + deleted;
    }
    const neutral = Math.max(0, TOTAL_BLOCKS - allocated);
    return { added, deleted, neutral };
  };

  const blocks = computeBlocks();
  const ADD_COLOR = 'var(--accent-green)';
  const DELETE_COLOR = 'var(--accent-red)';
  const NEUTRAL_COLOR = 'var(--foreground-subtle)';
  const visibleBlocks = [
    ...Array(blocks.added).fill(ADD_COLOR),
    ...Array(blocks.deleted).fill(DELETE_COLOR),
    ...Array(blocks.neutral).fill(NEUTRAL_COLOR),
  ].slice(0, TOTAL_BLOCKS);

  return (
    <div data-component="diff-changes" data-variant={variant} className={className}>
      {variant === 'bars' ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 12" fill="none">
          <g>
            {visibleBlocks.map((color, index) => (
              <rect key={`${color}-${index}`} x={index * 4} width="2" height="12" rx="1" fill={color} />
            ))}
          </g>
        </svg>
      ) : (
        <>
          <span data-slot="diff-changes-additions">+{additions}</span>
          <span data-slot="diff-changes-deletions">-{deletions}</span>
        </>
      )}
    </div>
  );
}

type DiffViewProps = {
  diff: FileDiff;
  shouldScrollToFirstChange?: boolean;
};

function DiffView({ diff, shouldScrollToFirstChange }: DiffViewProps) {
  const before = diff.before ?? '';
  const after = diff.after ?? '';
  const firstChangeRowRef = useRef<HTMLTableRowElement>(null);
  const hasScrolledRef = useRef(false);
  const [expandedSeparators, setExpandedSeparators] = useState<Set<number>>(new Set());

  const CONTEXT_LINES = 3;
  const EXPANSION_LINES = 20;

  const { hunks, visibleLines } = useMemo(() => {
    if (!before && !after) return { hunks: [], visibleLines: new Set<number>() };
    const diffLines = computeDiffLines(before, after);
    return computeDiffHunks(diffLines, CONTEXT_LINES);
  }, [before, after]);

  const diffLines = useMemo(() => {
    if (!before && !after) return [];
    return computeDiffLines(before, after);
  }, [before, after]);

  const toggleSeparator = (separatorIndex: number) => {
    setExpandedSeparators((prev) => {
      const next = new Set(prev);
      if (next.has(separatorIndex)) {
        next.delete(separatorIndex);
      } else {
        next.add(separatorIndex);
      }
      return next;
    });
  };

  const getVisibleLinesWithExpansion = () => {
    const result = new Set<number>(visibleLines);
    for (const sepIndex of expandedSeparators) {
      const hunk = hunks[sepIndex];
      if (!hunk) continue;
      const nextHunk = hunks[sepIndex + 1];
      const end = nextHunk ? nextHunk.startIndex : diffLines.length;
      for (let i = hunk.endIndex + 1; i < Math.min(end, hunk.endIndex + 1 + EXPANSION_LINES); i++) {
        result.add(i);
      }
    }
    return result;
  };

  const currentVisibleLines = getVisibleLinesWithExpansion();

  const getSeparatorLines = (separatorIndex: number) => {
    const hunk = hunks[separatorIndex];
    const nextHunk = hunks[separatorIndex + 1];
    if (!hunk || !nextHunk) return null;
    const start = hunk.endIndex + 1;
    const end = nextHunk.startIndex - 1;
    return { start, end, count: end - start + 1 };
  };

  useEffect(() => {
    if (shouldScrollToFirstChange && !hasScrolledRef.current && firstChangeRowRef.current) {
      const row = firstChangeRowRef.current;

      requestAnimationFrame(() => {
        const linesBefore = 2;
        const lineGap = 24;

        row.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });

        setTimeout(() => {
          const rowOffsetTop = row.offsetTop;
          const scrollTop = Math.max(0, rowOffsetTop - (linesBefore * lineGap));
          const scrollableContainer = row.closest('[data-slot="session-turn-accordion-content"]') as HTMLElement;
          if (scrollableContainer) {
            scrollableContainer.scrollTo({
              top: scrollTop,
              behavior: 'auto'
            });
          }
          hasScrolledRef.current = true;
        }, 50);
      });
    }
  }, [shouldScrollToFirstChange]);

  const firstChangeIndex = diffLines.findIndex(l => l.type === 'addition' || l.type === 'deletion');

  if (diffLines.length === 0) {
    return (
      <div data-component="diff-view" data-empty>
        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--foreground-muted)' }}>
          No content to display
        </div>
      </div>
    );
  }

  return (
    <div data-component="diff-view">
      <table data-diffs>
        <tbody>
          {diffLines.map((line, index) => {
            if (!currentVisibleLines.has(index)) return null;

            const separatorIndex = hunks.findIndex((hunk, i) => i < hunks.length - 1 && hunk.endIndex === index - 1);
            const isSeparatorStart = separatorIndex !== -1;

            return (
              <React.Fragment key={index}>
                {isSeparatorStart && (
                  <tr data-separator>
                    <td data-column-number>
                      <button
                        type="button"
                        data-separator-expand
                        data-expanded={expandedSeparators.has(separatorIndex) ? 'true' : undefined}
                        onClick={() => toggleSeparator(separatorIndex)}
                        aria-label={expandedSeparators.has(separatorIndex) ? 'Show less' : 'Show more'}
                      >
                        <svg
                          width="10"
                          height="6"
                          viewBox="0 0 10 6"
                          fill="none"
                          style={{
                            transform: expandedSeparators.has(separatorIndex) ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease'
                          }}
                        >
                          <path
                            d="M5 6L0 1H1L5 5L9 1H10L5 6Z"
                            fill="currentColor"
                          />
                        </svg>
                      </button>
                    </td>
                    <td
                      colSpan={2}
                      data-separator-content
                      onClick={() => toggleSeparator(separatorIndex)}
                      style={{
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      {getSeparatorLines(separatorIndex)?.count === 1
                        ? '1 unmodified line'
                        : `${getSeparatorLines(separatorIndex)?.count ?? 0} unmodified lines`}
                    </td>
                  </tr>
                )}
                <tr
                  key={index}
                  ref={index === firstChangeIndex ? firstChangeRowRef : null}
                  data-line
                  data-line-type={
                    line.type === 'addition'
                      ? 'change-addition'
                      : line.type === 'deletion'
                        ? 'change-deletion'
                        : !visibleLines.has(index) && currentVisibleLines.has(index)
                          ? 'context-expanded'
                          : 'context'
                  }
                >
                  <td data-column-number data-deletions={line.type === 'deletion' ? '' : undefined}>
                    {line.type === 'addition' ? '' : line.oldLineNumber ?? ''}
                  </td>
                  <td data-column-number>
                    {line.type === 'deletion' ? '' : line.newLineNumber ?? ''}
                  </td>
                  <td data-column-content>
                    {line.type === 'addition' && <Plus className="diff-icon inline" size={12} />}
                    {line.type === 'deletion' && <Minus className="diff-icon inline" size={12} />}
                    <span data-code>{line.content}</span>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type DiffSummaryProps = {
  diffs: FileDiff[];
};

export function DiffSummary({ diffs }: DiffSummaryProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [firstOpen, setFirstOpen] = useState<Set<string>>(new Set());
  const diffInit = 20;
  const diffBatch = 20;
  const [limit, setLimit] = useState(diffInit);

  useEffect(() => {
    setOpen(new Set());
    setFirstOpen(new Set());
    setLimit(diffInit);
  }, [diffs]);

  return (
    <div data-slot="session-turn-diff-summary">
      <div data-slot="session-turn-diff-title">Changes</div>
      <div data-slot="session-turn-accordion">
        {diffs.slice(0, limit).map((diff) => {
          const isOpen = open.has(diff.file);
          const hasContent = Boolean(diff.before || diff.after);
          const directory = getDirectory(diff.file);
          const filename = getFilename(diff.file);
          const isJustOpened = firstOpen.has(diff.file);

          const handleClick = () => {
            if (!hasContent) return;
            setOpen((prev) => {
              const newSet = new Set(prev);
              if (newSet.has(diff.file)) {
                newSet.delete(diff.file);
              } else {
                newSet.add(diff.file);
                setFirstOpen((prev) => new Set(prev).add(diff.file));
              }
              return newSet;
            });
          };

          return (
            <div
              key={diff.file}
              data-slot="session-turn-accordion-item"
              data-expanded={isOpen ? 'true' : undefined}
            >
              <div data-component="sticky-accordion-header" data-expanded={isOpen ? 'true' : undefined}>
                <button
                  type="button"
                  data-slot="session-turn-accordion-trigger"
                  onClick={handleClick}
                >
                  <div data-slot="session-turn-accordion-trigger-content">
                    <div data-slot="session-turn-file-info">
                      <FileIcon className="size-4 text-muted-foreground" />
                      <div data-slot="session-turn-file-path">
                        {directory && (
                          <span data-slot="session-turn-directory">{directory}/</span>
                        )}
                        <span data-slot="session-turn-filename">{filename}</span>
                      </div>
                    </div>
                    <div data-slot="session-turn-accordion-actions">
                      <DiffChanges changes={diff} />
                      <Icon name="chevron-grabber-vertical" size="small" className="text-muted-foreground" />
                    </div>
                  </div>
                </button>
              </div>
              {isOpen && hasContent && (
                <div data-slot="session-turn-accordion-content">
                  <DiffView diff={diff} shouldScrollToFirstChange={isJustOpened} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {diffs.length > limit && (
        <button
          type="button"
          data-slot="session-turn-accordion-more"
          onClick={() => setLimit((value) => Math.min(value + diffBatch, diffs.length))}
        >
          Show more ({diffs.length - limit})
        </button>
      )}
    </div>
  );
}
