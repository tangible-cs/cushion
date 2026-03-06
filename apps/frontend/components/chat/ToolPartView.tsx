'use client';

import React, { memo, useMemo, useState } from 'react';
import type { FileDiff, FilePart, ToolPart } from '@opencode-ai/sdk/v2/client';
import { Ban, File as FileIcon } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Collapsible } from './Collapsible';
import { CopyButton } from './CopyButton';
import { DiffChanges } from './DiffView';
import { Icon, getToolIconName } from './Icon';
import { Markdown } from './Markdown';
import { getDirectory, getFilename } from '@/lib/path-utils';
import { TextShimmer } from './TextShimmer';

// Strip ANSI escape codes from text
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// Tool classification
const INLINE_TOOLS = new Set(['read', 'glob', 'grep', 'list', 'webfetch', 'skill']);
const BLOCK_TOOLS = new Set(['bash', 'edit', 'write', 'apply_patch', 'task', 'todowrite', 'question']);
export const CONTEXT_GROUP_TOOLS = new Set(['read', 'glob', 'grep', 'list']);

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

function getRunningLabel(tool: string): string {
  switch (tool) {
    case 'read': return 'Reading...';
    case 'glob': return 'Globbing...';
    case 'grep': return 'Searching...';
    case 'list': return 'Listing...';
    case 'webfetch': return 'Fetching...';
    case 'bash': return 'Running...';
    case 'edit': return 'Editing...';
    case 'write': return 'Writing...';
    case 'apply_patch': return 'Patching...';
    case 'task': return 'Delegating...';
    case 'todowrite': return 'Planning...';
    case 'question': return 'Asking...';
    case 'skill': return 'Running skill...';
    default: return 'Running...';
  }
}

function getSubtitle(part: ToolPart): string | undefined {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const filePath = typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
  const description = typeof inputRecord?.description === 'string' ? inputRecord.description : undefined;
  const url = typeof inputRecord?.url === 'string' ? inputRecord.url : undefined;
  const path = typeof inputRecord?.path === 'string' ? inputRecord.path : undefined;

  if (part.tool === 'read' && filePath) {
    return filePath.split(/[/\\]/).pop() ?? filePath;
  }
  if ((part.tool === 'edit' || part.tool === 'write') && filePath) {
    return filePath.split(/[/\\]/).pop();
  }
  if (part.tool === 'bash' && description) {
    return description;
  }
  if (part.tool === 'webfetch' && url) {
    return url;
  }
  if (part.tool === 'list' && path) {
    return path.split(/[/\\]/).pop() ?? path;
  }
  if (part.tool === 'task' && description) {
    return description;
  }
  if (part.tool === 'todowrite') {
    const todos = getTodos(part);
    if (todos.length > 0) {
      const completed = todos.filter((t) => t.status === 'completed').length;
      return `${completed}/${todos.length}`;
    }
  }
  if (part.tool === 'question') {
    const questions = getQuestions(part);
    const answers = getQuestionAnswers(part);
    const count = questions.length;
    if (count === 0) return undefined;
    if (answers.length > 0) return `${count} answered`;
    return `${count} question${count > 1 ? 's' : ''}`;
  }
  return undefined;
}

function getLoadedFiles(part: ToolPart): string[] {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const loadedValue = metadataRecord?.loaded;
  if (part.tool === 'read' && Array.isArray(loadedValue)) {
    return loadedValue.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

function getFileDiff(part: ToolPart): FileDiff | undefined {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const fd = metadataRecord?.filediff;
  if (fd && typeof fd === 'object' && 'before' in (fd as object) && 'after' in (fd as object)) {
    return fd as FileDiff;
  }
  return undefined;
}

// --- Diagnostics types ---

interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity?: number;
}

function getDiagnostics(
  diagnosticsByFile: Record<string, Diagnostic[]> | undefined,
  filePath: string | undefined,
): Diagnostic[] {
  if (!diagnosticsByFile || !filePath) return [];
  const diagnostics = diagnosticsByFile[filePath] ?? [];
  return diagnostics.filter((d) => d.severity === 1).slice(0, 3);
}

function getDiagnosticsFromPart(part: ToolPart): Diagnostic[] {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const diagnosticsByFile = metadataRecord?.diagnostics as Record<string, Diagnostic[]> | undefined;
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const filePath = typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
  return getDiagnostics(diagnosticsByFile, filePath);
}

function DiagnosticsDisplay({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <div data-component="diagnostics">
      {diagnostics.map((diagnostic, i) => (
        <div key={i} data-slot="diagnostic">
          <span data-slot="diagnostic-label">ERROR</span>
          <span data-slot="diagnostic-location">
            [{diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}]
          </span>
          <span data-slot="diagnostic-message">{diagnostic.message}</span>
        </div>
      ))}
    </div>
  );
}

// --- Apply Patch types ---

interface ApplyPatchFile {
  filePath: string;
  relativePath: string;
  type: 'add' | 'update' | 'delete' | 'move';
  diff: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
  movePath?: string;
}

function getApplyPatchFiles(part: ToolPart): ApplyPatchFile[] {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const files = metadataRecord?.files;
  if (Array.isArray(files)) {
    return files.filter(
      (f): f is ApplyPatchFile =>
        f && typeof f === 'object' && 'filePath' in f && 'relativePath' in f && 'type' in f,
    );
  }
  return [];
}

// --- TodoWrite types ---

interface TodoItem {
  content: string;
  status: string;
}

function getTodos(part: ToolPart): TodoItem[] {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const metaTodos = metadataRecord?.todos;
  if (Array.isArray(metaTodos)) return metaTodos as TodoItem[];

  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const inputTodos = inputRecord?.todos;
  if (Array.isArray(inputTodos)) return inputTodos as TodoItem[];

  return [];
}

// --- Question types ---

interface QuestionInfo {
  question: string;
  header: string;
  options: { label: string; description?: string }[];
  multiple?: boolean;
}

type QuestionAnswer = string[];

function getQuestions(part: ToolPart): QuestionInfo[] {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const questions = inputRecord?.questions;
  if (Array.isArray(questions)) return questions as QuestionInfo[];
  return [];
}

function getQuestionAnswers(part: ToolPart): QuestionAnswer[] {
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const answers = metadataRecord?.answers;
  if (Array.isArray(answers)) return answers as QuestionAnswer[];
  return [];
}

function getTaskInfo(part: ToolPart): { subagentType?: string; description?: string } {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  return {
    subagentType: typeof inputRecord?.subagent_type === 'string' ? inputRecord.subagent_type : undefined,
    description: typeof inputRecord?.description === 'string' ? inputRecord.description : undefined,
  };
}

function getWriteContent(part: ToolPart): string | undefined {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  return typeof inputRecord?.content === 'string' ? inputRecord.content : undefined;
}

function getInputFilePath(part: ToolPart): string | undefined {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  return typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
}

function getBashCommand(part: ToolPart): string {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  return typeof inputRecord?.command === 'string' ? inputRecord.command : '';
}

function BashToolContent({ part }: { part: ToolPart }) {
  const command = getBashCommand(part);
  const output = part.state?.status === 'completed' && 'output' in part.state ? (part.state.output as string) : '';
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const metadata = part.state && 'metadata' in part.state ? part.state.metadata : undefined;
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : undefined;
  const metaOutput = typeof metadataRecord?.output === 'string' ? metadataRecord.output : '';

  const rawOutput = output || metaOutput;
  const cleanOutput = stripAnsi(rawOutput);

  const text = `$ ${command}${cleanOutput ? '\n\n' + cleanOutput : ''}`;

  return (
    <>
      <div data-component="bash-output">
        <div data-slot="bash-copy">
          <CopyButton text={text} />
        </div>
        <div data-slot="bash-scroll" data-scrollable>
          <pre data-slot="bash-pre">
            <code>{text}</code>
          </pre>
        </div>
      </div>
      {error && <ToolError error={error} />}
    </>
  );
}

function TodoWriteToolContent({ part }: { part: ToolPart }) {
  const todos = getTodos(part);

  if (todos.length === 0) return null;

  return (
    <div data-component="todos">
      {todos.map((todo, i) => (
        <label key={i} data-component="todo-checkbox" data-checked={todo.status === 'completed' ? '' : undefined}>
          <span data-slot="todo-checkbox-control">
            {todo.status === 'completed' && (
              <svg viewBox="0 0 12 12" fill="none" width="10" height="10">
                <path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
              </svg>
            )}
          </span>
          <span
            data-slot="todo-content"
            data-completed={todo.status === 'completed' ? '' : undefined}
          >
            {todo.content}
          </span>
        </label>
      ))}
    </div>
  );
}

function QuestionToolContent({ part }: { part: ToolPart }) {
  const questions = getQuestions(part);
  const answers = getQuestionAnswers(part);

  if (answers.length === 0 || questions.length === 0) return null;

  return (
    <div data-component="question-answers">
      {questions.map((q, i) => {
        const answer = answers[i] ?? [];
        return (
          <div key={i} data-slot="question-answer-item">
            <div data-slot="question-text">{q.question}</div>
            <div data-slot="answer-text">{answer.join(', ') || 'No answer'}</div>
          </div>
        );
      })}
    </div>
  );
}

function truncateByLines(text: string, maxLines: number): { truncated: string; totalLines: number; isTruncated: boolean } {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return { truncated: text, totalLines: lines.length, isTruncated: false };
  return { truncated: lines.slice(0, maxLines).join('\n'), totalLines: lines.length, isTruncated: true };
}

const TruncatedOutput = memo(function TruncatedOutput({
  text,
  maxLines,
  cacheKey,
}: {
  text: string;
  maxLines: number;
  cacheKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { truncated, totalLines, isTruncated } = useMemo(() => truncateByLines(text, maxLines), [text, maxLines]);

  return (
    <div data-component="tool-output" data-scrollable className="text-xs text-muted-foreground py-1">
      <Markdown text={expanded ? text : truncated} cacheKey={expanded ? cacheKey : `${cacheKey}-trunc`} />
      {isTruncated && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent-primary hover:underline mt-1"
        >
          {expanded ? 'Show less' : `Show all (${totalLines} lines)`}
        </button>
      )}
    </div>
  );
});

function ToolTriggerContent({
  part,
  isPending,
  subtitle,
}: {
  part: ToolPart;
  isPending: boolean;
  subtitle: string | undefined;
}) {
  const title = part.state?.status === 'completed' && 'title' in part.state ? part.state.title : part.tool;
  const icon = getToolIconName(part.tool);

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Icon name={icon} size="small" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-[14px] leading-[var(--line-height-large,1.5)] font-medium capitalize ${isPending ? 'text-shimmer' : 'text-foreground'}`}
          >
            {isPending ? getRunningLabel(part.tool) : title}
          </span>
          {!isPending && subtitle && (
            <>
              <span className="text-foreground/50">·</span>
              <span className="text-[14px] leading-[var(--line-height-large,1.5)] text-foreground/70 truncate">
                {subtitle}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Lazy-loaded DiffView for edit tool content
const LazyDiffView = React.lazy(() =>
  import('./DiffView').then((mod) => ({ default: mod.DiffView }))
);

function EditToolContent({ part }: { part: ToolPart }) {
  const fileDiff = getFileDiff(part);
  const filePath = fileDiff?.file || getInputFilePath(part) || '';
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const diagnostics = getDiagnosticsFromPart(part);

  if (!fileDiff) {
    // Fallback: show raw output if no filediff metadata
    const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
    return (
      <>
        {output && (
          <div className="text-xs text-muted-foreground py-1 pl-7">
            <Markdown text={output} cacheKey={`${part.id}-fallback`} />
          </div>
        )}
        <DiagnosticsDisplay diagnostics={diagnostics} />
        {error && <div className="pl-7"><ToolError error={error} /></div>}
      </>
    );
  }

  return (
    <>
      <div data-component="edit-content">
        <ToolFileAccordion path={filePath} actions={<DiffChanges changes={fileDiff} />}>
          <React.Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading diff...</div>}>
            <LazyDiffView diff={fileDiff} />
          </React.Suspense>
        </ToolFileAccordion>
      </div>
      <DiagnosticsDisplay diagnostics={diagnostics} />
      {error && <div className="pl-7"><ToolError error={error} /></div>}
    </>
  );
}

function WriteToolContent({ part }: { part: ToolPart }) {
  const content = getWriteContent(part);
  const filePath = getInputFilePath(part) || '';
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const fileDiff = getFileDiff(part);
  const diagnostics = getDiagnosticsFromPart(part);

  if (fileDiff) {
    // If write tool has filediff (overwriting existing file), show diff
    return (
      <>
        <div data-component="edit-content">
          <ToolFileAccordion path={filePath} actions={<DiffChanges changes={fileDiff} />}>
            <React.Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading diff...</div>}>
              <LazyDiffView diff={fileDiff} />
            </React.Suspense>
          </ToolFileAccordion>
        </div>
        <DiagnosticsDisplay diagnostics={diagnostics} />
        {error && <div className="pl-7"><ToolError error={error} /></div>}
      </>
    );
  }

  if (!content) {
    const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
    return (
      <>
        {output && (
          <div className="text-xs text-muted-foreground py-1 pl-7">
            <Markdown text={output} cacheKey={`${part.id}-fallback`} />
          </div>
        )}
        <DiagnosticsDisplay diagnostics={diagnostics} />
        {error && <div className="pl-7"><ToolError error={error} /></div>}
      </>
    );
  }

  return (
    <>
      <div data-component="write-content">
        <ToolFileAccordion path={filePath}>
          <pre data-component="write-code"><code>{content}</code></pre>
        </ToolFileAccordion>
      </div>
      <DiagnosticsDisplay diagnostics={diagnostics} />
      {error && <div className="pl-7"><ToolError error={error} /></div>}
    </>
  );
}

function ApplyPatchTypeBadge({ type }: { type: ApplyPatchFile['type'] }) {
  const label = type === 'add' ? 'Created' : type === 'delete' ? 'Deleted' : type === 'move' ? 'Moved' : null;
  if (!label) return null;
  const dataType = type === 'add' ? 'added' : type === 'delete' ? 'removed' : 'modified';
  return <span data-slot="apply-patch-change" data-type={dataType}>{label}</span>;
}

function ApplyPatchTrigger({ part, isPending, files }: { part: ToolPart; isPending: boolean; files: ApplyPatchFile[] }) {
  const single = files.length === 1 ? files[0] : undefined;

  if (single) {
    // Single-file: render like EditWriteTrigger
    const filename = getFilename(single.relativePath);
    const directory = single.relativePath.includes('/') ? getDirectory(single.relativePath) : '';

    return (
      <div data-component="edit-trigger">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon name="code-lines" size="small" />
          <div data-slot="message-part-title-area">
            <div data-slot="message-part-title">
              <span data-slot="message-part-title-text" className={isPending ? 'text-shimmer' : ''}>
                {isPending ? getRunningLabel('apply_patch') : 'Patch'}
              </span>
              {!isPending && filename && (
                <span data-slot="message-part-title-filename">{filename}</span>
              )}
            </div>
            {!isPending && directory && (
              <div data-slot="message-part-path">
                <span data-slot="message-part-directory">{directory}</span>
              </div>
            )}
          </div>
        </div>
        <div data-slot="message-part-actions">
          {!isPending && (
            <DiffChanges changes={{ additions: single.additions, deletions: single.deletions }} />
          )}
        </div>
      </div>
    );
  }

  // Multi-file: show "Patch" + file count subtitle
  const subtitle = files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : '';

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <Icon name="code-lines" size="small" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-[14px] leading-[var(--line-height-large,1.5)] font-medium ${isPending ? 'text-shimmer' : 'text-foreground'}`}
          >
            {isPending ? getRunningLabel('apply_patch') : 'Patch'}
          </span>
          {!isPending && subtitle && (
            <>
              <span className="text-foreground/50">·</span>
              <span className="text-[14px] leading-[var(--line-height-large,1.5)] text-foreground/70 truncate">
                {subtitle}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplyPatchContent({ part, files }: { part: ToolPart; files: ApplyPatchFile[] }) {
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const single = files.length === 1 ? files[0] : undefined;

  if (files.length === 0) {
    // Fallback: show raw output if no files metadata
    const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
    return (
      <>
        {output && (
          <div className="text-xs text-muted-foreground py-1 pl-7">
            <Markdown text={output} cacheKey={`${part.id}-fallback`} />
          </div>
        )}
        {error && <div className="pl-7"><ToolError error={error} /></div>}
      </>
    );
  }

  if (single) {
    // Single file: like edit tool content with type badge
    const actions = single.type === 'update'
      ? <DiffChanges changes={{ additions: single.additions, deletions: single.deletions }} />
      : <ApplyPatchTypeBadge type={single.type} />;

    return (
      <>
        <div data-component="edit-content">
          <ToolFileAccordion path={single.relativePath} actions={actions}>
            <div data-component="apply-patch-file-diff">
              <React.Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading diff...</div>}>
                <LazyDiffView diff={{ file: single.filePath, before: single.before, after: single.after, additions: single.additions, deletions: single.deletions }} />
              </React.Suspense>
            </div>
          </ToolFileAccordion>
        </div>
        {error && <div className="pl-7"><ToolError error={error} /></div>}
      </>
    );
  }

  // Multi-file accordion
  return (
    <>
      <div data-component="apply-patch-files">
        {files.map((file) => (
          <ApplyPatchFileEntry key={file.filePath} file={file} />
        ))}
      </div>
      {error && <div className="pl-7"><ToolError error={error} /></div>}
    </>
  );
}

function ApplyPatchFileEntry({ file }: { file: ApplyPatchFile }) {
  const [open, setOpen] = useState(file.type !== 'delete');
  const directory = file.relativePath.includes('/') ? getDirectory(file.relativePath) : '';
  const filename = getFilename(file.relativePath);

  const actions = file.type === 'update'
    ? <DiffChanges changes={{ additions: file.additions, deletions: file.deletions }} />
    : <ApplyPatchTypeBadge type={file.type} />;

  return (
    <div data-component="apply-patch-file-entry" data-type={file.type}>
      <button
        type="button"
        data-slot="apply-patch-file-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div data-slot="apply-patch-trigger-content">
          <div data-slot="apply-patch-file-info">
            <FileIcon className="size-4 text-muted-foreground flex-shrink-0" />
            <div data-slot="apply-patch-file-name-container">
              {directory && (
                <span data-slot="apply-patch-directory">{'\u202A' + directory + '\u202C'}</span>
              )}
              <span data-slot="apply-patch-filename">{filename}</span>
            </div>
          </div>
          <div data-slot="apply-patch-trigger-actions">
            {actions}
            <Icon name="chevron-grabber-vertical" size="small" className="text-muted-foreground" />
          </div>
        </div>
      </button>
      {open && (
        <div data-slot="apply-patch-file-content">
          <div data-component="apply-patch-file-diff">
            <React.Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading diff...</div>}>
              <LazyDiffView diff={{ file: file.filePath, before: file.before, after: file.after, additions: file.additions, deletions: file.deletions }} />
            </React.Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolFileAccordion({ path, actions, children }: { path: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const directory = path.includes('/') || path.includes('\\') ? getDirectory(path) : '';
  const filename = getFilename(path);

  return (
    <div data-component="tool-file-accordion">
      <button
        type="button"
        data-slot="tool-file-accordion-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div data-slot="tool-file-trigger-content">
          <div data-slot="tool-file-info">
            <FileIcon className="size-4 text-muted-foreground flex-shrink-0" />
            <div data-slot="tool-file-name-container">
              {directory && (
                <span data-slot="tool-file-directory">{'\u202A' + directory + '\u202C'}</span>
              )}
              <span data-slot="tool-file-filename">{filename}</span>
            </div>
          </div>
          <div data-slot="tool-file-trigger-actions">
            {actions}
            <Icon name="chevron-grabber-vertical" size="small" className="text-muted-foreground" />
          </div>
        </div>
      </button>
      {open && <div data-slot="tool-file-accordion-content">{children}</div>}
    </div>
  );
}

function EditWriteTrigger({ part, isPending }: { part: ToolPart; isPending: boolean }) {
  const filePath = getInputFilePath(part) || '';
  const filename = getFilename(filePath);
  const directory = filePath.includes('/') || filePath.includes('\\') ? getDirectory(filePath) : '';
  const fileDiff = getFileDiff(part);
  const title = part.tool === 'edit' ? 'Edit' : 'Write';

  return (
    <div data-component="edit-trigger">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon name="code-lines" size="small" />
        <div data-slot="message-part-title-area">
          <div data-slot="message-part-title">
            <span data-slot="message-part-title-text" className={isPending ? 'text-shimmer' : ''}>
              {isPending ? getRunningLabel(part.tool) : title}
            </span>
            {!isPending && filename && (
              <span data-slot="message-part-title-filename">{filename}</span>
            )}
          </div>
          {!isPending && directory && (
            <div data-slot="message-part-path">
              <span data-slot="message-part-directory">{directory}</span>
            </div>
          )}
        </div>
      </div>
      <div data-slot="message-part-actions">
        {!isPending && fileDiff && <DiffChanges changes={fileDiff} />}
      </div>
    </div>
  );
}

function toolDefaultOpen(tool: string, shellExpanded: boolean, editExpanded: boolean): boolean {
  if (tool === 'bash') return shellExpanded;
  if (tool === 'edit' || tool === 'write' || tool === 'apply_patch') return editExpanded;
  return false;
}

export function ToolPartView({ part }: ToolPartViewProps) {
  const status = part.state?.status ?? 'pending';
  const error = status === 'error' && 'error' in part.state ? part.state.error : null;
  const isPending = status === 'pending' || status === 'running';
  const isInline = INLINE_TOOLS.has(part.tool);
  const shellExpanded = useChatStore((s) => s.displayPreferences.shellToolPartsExpanded);
  const editExpanded = useChatStore((s) => s.displayPreferences.editToolPartsExpanded);

  const output = status === 'completed' && 'output' in part.state ? part.state.output : null;
  const attachments = (status === 'completed' && 'attachments' in part.state ? part.state.attachments : null) ?? null;
  const subtitle = getSubtitle(part);
  const loadedFiles = getLoadedFiles(part);

  const hasOutput = !!output && part.tool !== 'read';
  const hasContent = hasOutput || !!error || (attachments && attachments.length > 0) || loadedFiles.length > 0;

  // Inline tools: compact row, collapsible only when content exists
  if (isInline) {
    if (!hasContent) {
      return (
        <div className="flex items-center gap-5 py-1 px-2 text-left">
          <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
        </div>
      );
    }

    return (
      <Collapsible defaultOpen={false}>
        <Collapsible.Trigger
          className="w-full flex items-center gap-5 py-1 px-2 rounded hover:bg-muted/30 transition-colors text-left"
        >
          <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
          <Collapsible.Arrow className="text-muted-foreground" />
        </Collapsible.Trigger>
        <Collapsible.Content className="pl-7 mt-1 space-y-1">
          <ToolContentBody
            part={part}
            output={output}
            error={error}
            attachments={attachments}
            loadedFiles={loadedFiles}
            maxOutputLines={3}
          />
        </Collapsible.Content>
      </Collapsible>
    );
  }

  // Apply Patch tool: specialized multi-file accordion
  if (part.tool === 'apply_patch') {
    const files = getApplyPatchFiles(part);
    const defaultOpen = status === 'completed' && editExpanded;

    return (
      <div data-component="apply-patch-tool">
        <Collapsible defaultOpen={defaultOpen}>
          <Collapsible.Trigger
            className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
          >
            <ApplyPatchTrigger part={part} isPending={isPending} files={files} />
            {!isPending && <Collapsible.Arrow className="text-muted-foreground" />}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ApplyPatchContent part={part} files={files} />
          </Collapsible.Content>
        </Collapsible>
      </div>
    );
  }

  // Edit/Write tools: specialized rendering with diff viewer
  if (part.tool === 'edit' || part.tool === 'write') {
    const defaultOpen = status === 'completed' && editExpanded;

    return (
      <div data-component={part.tool === 'edit' ? 'edit-tool' : 'write-tool'}>
        <Collapsible defaultOpen={defaultOpen}>
          <Collapsible.Trigger
            className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
          >
            <EditWriteTrigger part={part} isPending={isPending} />
            {!isPending && <Collapsible.Arrow className="text-muted-foreground" />}
          </Collapsible.Trigger>
          <Collapsible.Content>
            {part.tool === 'edit' ? (
              <EditToolContent part={part} />
            ) : (
              <WriteToolContent part={part} />
            )}
          </Collapsible.Content>
        </Collapsible>
      </div>
    );
  }

  // Bash tool: dedicated output block with $ command format
  if (part.tool === 'bash') {
    const defaultOpen = status === 'completed' && shellExpanded;

    return (
      <div data-component="bash-tool">
        <Collapsible defaultOpen={defaultOpen}>
          <Collapsible.Trigger
            className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
          >
            <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
            {!isPending && <Collapsible.Arrow className="text-muted-foreground" />}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <BashToolContent part={part} />
          </Collapsible.Content>
        </Collapsible>
      </div>
    );
  }

  // TodoWrite tool: always expanded, locked open
  if (part.tool === 'todowrite') {
    return (
      <div data-component="todowrite-tool">
        <div className="flex items-center gap-5 py-1.5 px-2 text-left">
          <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
        </div>
        {!isPending && <TodoWriteToolContent part={part} />}
      </div>
    );
  }

  // Question tool: show answered Q&A pairs when completed, or "Dismissed" for dismissed questions
  if (part.tool === 'question') {
    const questionError = status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
    const isDismissed = questionError?.replace('Error: ', '').includes('dismissed this question');

    if (isDismissed) {
      return (
        <div data-component="question-tool">
          <div className="flex items-center gap-5 py-1.5 px-2 text-left">
            <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
          </div>
          <div className="flex justify-end w-full px-2 pb-1">
            <span className="text-sm text-muted-foreground cursor-default">Dismissed</span>
          </div>
        </div>
      );
    }

    const answers = getQuestionAnswers(part);
    const completed = answers.length > 0;

    return (
      <div data-component="question-tool">
        <Collapsible defaultOpen={completed}>
          <Collapsible.Trigger
            className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
          >
            <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
            {!isPending && <Collapsible.Arrow className="text-muted-foreground" />}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <QuestionToolContent part={part} />
          </Collapsible.Content>
        </Collapsible>
      </div>
    );
  }

  // Task/subagent tool: TextShimmer title, description subtitle, no collapsible content
  if (part.tool === 'task') {
    const { subagentType, description } = getTaskInfo(part);
    const title = `Agent${subagentType ? `: ${subagentType}` : ''}`;

    return (
      <div data-component="task-tool">
        <div className="flex items-center gap-2 py-1.5 px-2 text-left min-w-0">
          <Icon name="task" size="small" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-[14px] leading-[var(--line-height-large,1.5)] font-medium capitalize flex-shrink-0">
              <TextShimmer text={title} active={isPending} />
            </span>
            {!isPending && description && (
              <>
                <span className="text-foreground/50">·</span>
                <span className="text-[14px] leading-[var(--line-height-large,1.5)] text-foreground/70 truncate">
                  {description}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Block tools: per-tool-type default open (matching OpenCode)
  const defaultOpen = status === 'completed' && hasContent && toolDefaultOpen(part.tool, shellExpanded, editExpanded);

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <Collapsible.Trigger
        className="w-full flex items-center gap-5 py-1.5 px-2 rounded hover:bg-muted/30 transition-colors text-left"
      >
        <ToolTriggerContent part={part} isPending={isPending} subtitle={subtitle} />
        {hasContent && (
          <Collapsible.Arrow className="text-muted-foreground" />
        )}
      </Collapsible.Trigger>
      <Collapsible.Content className="pl-7 mt-1 space-y-1">
        <ToolContentBody
          part={part}
          output={output}
          error={error}
          attachments={attachments}
          loadedFiles={loadedFiles}
          maxOutputLines={part.tool === 'bash' ? 10 : 3}
        />
      </Collapsible.Content>
    </Collapsible>
  );
}

function ToolError({ error }: { error: string }) {
  const cleaned = error.replace(/^Error:\s*/, '');
  const [title, ...rest] = cleaned.split(': ');
  const hasStructuredTitle = title && title.length < 30 && rest.length > 0;

  return (
    <div data-component="tool-error">
      <Ban size={14} className="tool-error-icon" />
      {hasStructuredTitle ? (
        <div data-slot="tool-error-content">
          <span data-slot="tool-error-title">{title}</span>
          <span data-slot="tool-error-message">{rest.join(': ')}</span>
        </div>
      ) : (
        <span data-slot="tool-error-message">{cleaned}</span>
      )}
    </div>
  );
}

function ToolContentBody({
  part,
  output,
  error,
  attachments,
  loadedFiles,
  maxOutputLines,
}: {
  part: ToolPart;
  output: string | null;
  error: string | null;
  attachments: FilePart[] | null;
  loadedFiles: string[];
  maxOutputLines: number;
}) {
  return (
    <>
      {loadedFiles.length > 0 && (
        <div className="space-y-0.5">
          {loadedFiles.map((filepath, index) => (
            <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-accent-green">→</span>
              <span>Loaded {filepath}</span>
            </div>
          ))}
        </div>
      )}
      {output && part.tool !== 'read' && (
        <TruncatedOutput text={output} maxLines={maxOutputLines} cacheKey={part.id} />
      )}
      {attachments && attachments.length > 0 && <AttachmentList parts={attachments} />}
      {error && <ToolError error={error} />}
    </>
  );
}

// --- Context Tool Grouping ---

function contextToolSummary(parts: ToolPart[]): string[] {
  const read = parts.filter((p) => p.tool === 'read').length;
  const search = parts.filter((p) => p.tool === 'glob' || p.tool === 'grep').length;
  const list = parts.filter((p) => p.tool === 'list').length;
  return [
    read ? `${read} file${read > 1 ? 's' : ''} read` : undefined,
    search ? `${search} pattern${search > 1 ? 's' : ''} searched` : undefined,
    list ? `${list} director${list > 1 ? 'ies' : 'y'} listed` : undefined,
  ].filter((v): v is string => !!v);
}

function contextToolRunningSummary(parts: ToolPart[]): string[] {
  const read = parts.filter((p) => p.tool === 'read').length;
  const search = parts.filter((p) => p.tool === 'glob' || p.tool === 'grep').length;
  const list = parts.filter((p) => p.tool === 'list').length;
  return [
    read ? `Reading ${read} file${read > 1 ? 's' : ''}` : undefined,
    search ? `Searching ${search} pattern${search > 1 ? 's' : ''}` : undefined,
    list ? `Listing ${list} director${list > 1 ? 'ies' : 'y'}` : undefined,
  ].filter((v): v is string => !!v);
}

function contextToolTriggerInfo(part: ToolPart): { title: string; subtitle?: string; args?: string[] } {
  const input = part.state && 'input' in part.state ? part.state.input : undefined;
  const inputRecord = input && typeof input === 'object' ? (input as Record<string, unknown>) : undefined;
  const filePath = typeof inputRecord?.filePath === 'string' ? inputRecord.filePath : undefined;
  const pattern = typeof inputRecord?.pattern === 'string' ? inputRecord.pattern : undefined;
  const include = typeof inputRecord?.include === 'string' ? inputRecord.include : undefined;
  const path = typeof inputRecord?.path === 'string' ? inputRecord.path : '/';
  const offset = typeof inputRecord?.offset === 'number' ? inputRecord.offset : undefined;
  const limit = typeof inputRecord?.limit === 'number' ? inputRecord.limit : undefined;

  const getFilename = (p: string) => p.split(/[/\\]/).pop() || p;
  const getDirectory = (p: string) => {
    const parts = p.split(/[/\\]/);
    return parts.length > 1 ? parts.slice(-2).join('/') : parts.pop() || p;
  };

  switch (part.tool) {
    case 'read': {
      const args: string[] = [];
      if (offset !== undefined) args.push('offset=' + offset);
      if (limit !== undefined) args.push('limit=' + limit);
      return { title: 'Read', subtitle: filePath ? getFilename(filePath) : undefined, args };
    }
    case 'list':
      return { title: 'List', subtitle: getDirectory(path) };
    case 'glob':
      return { title: 'Glob', subtitle: getDirectory(path), args: pattern ? ['pattern=' + pattern] : [] };
    case 'grep': {
      const args: string[] = [];
      if (pattern) args.push('pattern=' + pattern);
      if (include) args.push('include=' + include);
      return { title: 'Grep', subtitle: getDirectory(path), args };
    }
    default:
      return { title: part.tool };
  }
}

type ContextToolGroupProps = {
  parts: ToolPart[];
  busy?: boolean;
};

export const ContextToolGroup = memo(function ContextToolGroup({ parts, busy }: ContextToolGroupProps) {
  const pending = useMemo(
    () => !!busy || parts.some((p) => p.state?.status === 'pending' || p.state?.status === 'running'),
    [parts, busy],
  );
  const summary = useMemo(() => (pending ? contextToolRunningSummary(parts) : contextToolSummary(parts)), [parts, pending]);
  const details = summary.join(', ');

  return (
    <Collapsible defaultOpen={false}>
      <Collapsible.Trigger className="w-full">
        <div data-component="context-tool-group-trigger">
          <span data-slot="context-tool-group-title">
            <span data-slot="context-tool-group-label">
              {pending ? <TextShimmer text="Gathering context..." /> : 'Gathered context'}
            </span>
            {details.length > 0 && (
              <span data-slot="context-tool-group-summary">{details}</span>
            )}
          </span>
          <Collapsible.Arrow />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div data-component="context-tool-group-list">
          {parts.map((part) => {
            const info = contextToolTriggerInfo(part);
            const running = part.state?.status === 'pending' || part.state?.status === 'running';
            return (
              <div key={part.id} data-slot="context-tool-group-item">
                <div data-slot="basic-tool-tool-info-main">
                  <span data-slot="basic-tool-tool-title">
                    {running ? <TextShimmer text={info.title} /> : info.title}
                  </span>
                  {!running && info.subtitle && (
                    <span data-slot="basic-tool-tool-subtitle">{info.subtitle}</span>
                  )}
                  {!running && info.args && info.args.length > 0 && info.args.map((arg, i) => (
                    <span key={i} data-slot="basic-tool-tool-arg">{arg}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible>
  );
});
