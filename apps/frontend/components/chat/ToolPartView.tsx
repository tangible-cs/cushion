'use client';

import React from 'react';
import type { FilePart, ToolPart } from '@opencode-ai/sdk/v2/client';
import { Collapsible } from './Collapsible';
import { Icon, getToolIconName } from './Icon';
import { Markdown } from './Markdown';

type AttachmentListProps = {
  parts: FilePart[];
};

export function AttachmentList({ parts }: AttachmentListProps) {
  const images = parts.filter((part) => part.mime.startsWith('image/') && part.url.startsWith('data:'));
  const files = parts.filter((part) => !part.mime.startsWith('image/'));
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((part) => (
            <img
              key={part.id}
              src={part.url}
              alt={part.filename ?? 'attachment'}
              className="h-16 w-16 rounded-md object-cover border border-border"
            />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Attachments: {files.map((part) => part.filename ?? part.url ?? 'file').join(', ')}
        </div>
      )}
    </div>
  );
}

type ToolPartViewProps = {
  part: ToolPart;
};

export function ToolPartView({ part }: ToolPartViewProps) {
  const title = part.state?.status === 'completed' && 'title' in part.state ? part.state.title : part.tool;
  const status = part.state?.status ?? 'pending';
  const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
  const error = part.state?.status === 'error' && 'error' in part.state ? part.state.error : null;
  const attachments = part.state?.status === 'completed' && 'attachments' in part.state ? part.state.attachments : null;
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const icon = getToolIconName(part.tool);

  let subtitle: string | undefined;
  const filePath = typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
  const description = typeof inputRecord?.description === 'string' ? inputRecord.description : undefined;
  const url = typeof inputRecord?.url === 'string' ? inputRecord.url : undefined;
  const path = typeof inputRecord?.path === 'string' ? inputRecord.path : undefined;
  if (part.tool === 'read' && filePath) {
    subtitle = filePath.split(/[/\\]/).pop() ?? filePath;
  }
  if ((part.tool === 'edit' || part.tool === 'write') && filePath) {
    subtitle = filePath.split(/[/\\]/).pop();
  }
  if (part.tool === 'bash' && description) {
    subtitle = description;
  }
  if (part.tool === 'webfetch' && url) {
    subtitle = url;
  }
  if (part.tool === 'list' && path) {
    subtitle = path.split(/[/\\]/).pop() ?? path;
  }
  if (part.tool === 'task' && description) {
    subtitle = description;
  }

  const loadedValue = metadataRecord?.loaded;
  const loadedFiles = part.tool === 'read' && Array.isArray(loadedValue)
    ? loadedValue.filter((x): x is string => typeof x === 'string')
    : [];

  const hasOutput = !!output && part.tool !== 'read';
  const hasContent = hasOutput || !!error || (attachments && attachments.length > 0) || loadedFiles.length > 0;
  const defaultOpen = status === 'completed' && hasContent;

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Collapsible.Trigger
        className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-5 min-w-0 flex-1">
          <Icon name={icon} size="small" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground capitalize">
                {title}
              </span>
              {subtitle && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {hasContent && (
          <Collapsible.Arrow className="text-muted-foreground" />
        )}
      </Collapsible.Trigger>
      <Collapsible.Content className="pl-7 mt-1 space-y-1">
        {loadedFiles.length > 0 && (
          <div className="space-y-0.5">
            {loadedFiles.map((filepath, index) => (
              <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-green-500">→</span>
                <span>Loaded {filepath}</span>
              </div>
            ))}
          </div>
        )}
        {output && part.tool !== 'read' && (
          <div data-component="tool-output" data-scrollable className="text-xs text-muted-foreground py-1">
            <Markdown text={output} cacheKey={part.id} />
          </div>
        )}
        {attachments && attachments.length > 0 && <AttachmentList parts={attachments} />}
        {error && (
          <div className="text-xs text-red-400 py-1">{error}</div>
        )}
      </Collapsible.Content>
    </Collapsible>
  );
}
