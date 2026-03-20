
import React from 'react';
import type { FilePart, AgentPart } from '@opencode-ai/sdk/v2/client';

export type HighlightSegment = {
  text: string;
  type?: 'file' | 'agent';
};

export function buildHighlightSegments(text: string, fileRefs: FilePart[], agentRefs: AgentPart[]): HighlightSegment[] {
  const references: Array<{ start: number; end: number; type: 'file' | 'agent' }> = [];

  for (const ref of fileRefs) {
    const source = ref.source?.text;
    if (!source) continue;
    references.push({ start: source.start, end: source.end, type: 'file' });
  }

  for (const ref of agentRefs) {
    const source = ref.source;
    if (!source) continue;
    references.push({ start: source.start, end: source.end, type: 'agent' });
  }

  references.sort((a, b) => a.start - b.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const ref of references) {
    if (ref.start < cursor) continue;
    if (ref.start > text.length) break;
    if (ref.start > cursor) {
      segments.push({ text: text.slice(cursor, ref.start) });
    }
    const end = Math.min(ref.end, text.length);
    segments.push({ text: text.slice(ref.start, end), type: ref.type });
    cursor = end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text }];
}

export function HighlightedText({ text, fileRefs, agentRefs }: { text: string; fileRefs: FilePart[]; agentRefs: AgentPart[] }) {
  const segments = buildHighlightSegments(text, fileRefs, agentRefs);
  return (
    <>
      {segments.map((segment, index) => {
        if (!segment.type) return <span key={index}>{segment.text}</span>;
        const className = segment.type === 'file'
          ? 'rounded bg-muted/30 px-0.5'
          : 'rounded bg-[var(--md-accent)]/20 px-0.5';
        return (
          <span key={index} className={className} data-highlight={segment.type}>
            {segment.text}
          </span>
        );
      })}
    </>
  );
}

export function ContextList({ parts }: { parts: FilePart[] }) {
  const labels = parts.map((part) => part.filename ?? part.url ?? 'file');
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      Context: {labels.join(', ')}
    </div>
  );
}
