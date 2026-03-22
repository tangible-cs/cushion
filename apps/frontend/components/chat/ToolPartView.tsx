
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FileDiff, FilePart, ToolPart } from '@opencode-ai/sdk/v2/client';
import { animate, type AnimationPlaybackControls } from 'motion';
import { File as FileIcon } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Collapsible } from './Collapsible';
import { CopyButton } from './CopyButton';
import { DiffChanges } from './DiffView';
import { Icon, getToolIconName } from './Icon';
import { Markdown } from './Markdown';
import { getDirectory, getFilename } from '@/lib/path-utils';
import { TextShimmer } from './TextShimmer';
import { BasicTool, type TriggerTitle } from './BasicTool';
import { AnimatedCountList } from './AnimatedCountList';
import { ToolStatusTitle } from './ToolStatusTitle';
import { ShellSubmessage } from './ShellSubmessage';
import { ToolErrorCard } from './ToolErrorCard';
import { prefersReducedMotion } from './message-helpers';

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

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

function getCompletedTitle(part: ToolPart): string {
  if (part.state?.status === 'completed' && 'title' in part.state && typeof part.state.title === 'string') {
    return part.state.title;
  }
  return part.tool;
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

// Diagnostics types

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

// Apply Patch types

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

// TodoWrite types

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

// Question types

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

// Tool Content Components

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
      {error && <ToolError tool={part.tool} error={error} />}
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

const TRUNCATE_SPRING = { type: 'spring' as const, visualDuration: 0.35, bounce: 0 };

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
  const containerRef = useRef<HTMLDivElement>(null);
  const heightAnim = useRef<AnimationPlaybackControls | null>(null);
  const isFirstRender = useRef(true);
  const { truncated, totalLines, isTruncated } = useMemo(() => truncateByLines(text, maxLines), [text, maxLines]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const el = containerRef.current;
    if (!el || !isTruncated) return;

    if (prefersReducedMotion()) {
      el.style.height = 'auto';
      return;
    }

    heightAnim.current?.stop();
    el.style.overflow = 'hidden';
    heightAnim.current = animate(el, { height: 'auto' }, TRUNCATE_SPRING);
    heightAnim.current.finished.then(() => {
      if (!containerRef.current) return;
      containerRef.current.style.overflow = 'visible';
      containerRef.current.style.height = 'auto';
    });

    return () => { heightAnim.current?.stop(); };
  }, [expanded, isTruncated]);

  return (
    <div ref={containerRef} data-component="tool-output" data-scrollable className="text-xs text-muted-foreground py-1">
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

const LazyDiffView = React.lazy(() =>
  import('./DiffView').then((mod) => ({ default: mod.DiffView }))
);

function EditToolContent({ part }: { part: ToolPart }) {
  const fileDiff = getFileDiff(part);
  const filePath = fileDiff?.file || getInputFilePath(part) || '';
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const diagnostics = getDiagnosticsFromPart(part);

  if (!fileDiff) {
    const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
    return (
      <>
        {output && (
          <div className="text-xs text-muted-foreground py-1 pl-7">
            <Markdown text={output} cacheKey={`${part.id}-fallback`} />
          </div>
        )}
        <DiagnosticsDisplay diagnostics={diagnostics} />
        {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
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
      {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
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
        {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
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
        {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
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
      {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
    </>
  );
}

function ApplyPatchTypeBadge({ type }: { type: ApplyPatchFile['type'] }) {
  const label = type === 'add' ? 'Created' : type === 'delete' ? 'Deleted' : type === 'move' ? 'Moved' : null;
  if (!label) return null;
  const dataType = type === 'add' ? 'added' : type === 'delete' ? 'removed' : 'modified';
  return <span data-slot="apply-patch-change" data-type={dataType}>{label}</span>;
}

function ApplyPatchContent({ part, files }: { part: ToolPart; files: ApplyPatchFile[] }) {
  const error = part.state?.status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
  const single = files.length === 1 ? files[0] : undefined;

  if (files.length === 0) {
    const output = part.state?.status === 'completed' && 'output' in part.state ? part.state.output : null;
    return (
      <>
        {output && (
          <div className="text-xs text-muted-foreground py-1 pl-7">
            <Markdown text={output} cacheKey={`${part.id}-fallback`} />
          </div>
        )}
        {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
      </>
    );
  }

  if (single) {
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
        {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
      </>
    );
  }

  return (
    <>
      <div data-component="apply-patch-files">
        {files.map((file) => (
          <ApplyPatchFileEntry key={file.filePath} file={file} />
        ))}
      </div>
      {error && <div className="pl-7"><ToolError tool={part.tool} error={error} /></div>}
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
                <span data-slot="apply-patch-directory">{'\u202A' + directory + '/' + '\u202C'}</span>
              )}
              <span data-slot="apply-patch-filename">{filename}</span>
            </div>
          </div>
          <div data-slot="apply-patch-trigger-actions">
            {actions}
            <div data-slot="file-accordion-arrow" data-open={open || undefined}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
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
                <span data-slot="tool-file-directory">{'\u202A' + directory + '/' + '\u202C'}</span>
              )}
              <span data-slot="tool-file-filename">{filename}</span>
            </div>
          </div>
          <div data-slot="tool-file-trigger-actions">
            {actions}
            <div data-slot="file-accordion-arrow" data-open={open || undefined}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </button>
      {open && <div data-slot="tool-file-accordion-content">{children}</div>}
    </div>
  );
}

// Build trigger objects

function buildTriggerTitle(part: ToolPart): TriggerTitle {
  const isPending = part.state?.status === 'pending' || part.state?.status === 'running';
  const title = isPending ? getRunningLabel(part.tool) : getCompletedTitle(part);
  const subtitle = isPending ? undefined : getSubtitle(part);
  // Don't show subtitle if it matches the title (e.g. bash description = title)
  return { title, subtitle: subtitle === title ? undefined : subtitle };
}

function buildEditTrigger(part: ToolPart): TriggerTitle {
  const isPending = part.state?.status === 'pending' || part.state?.status === 'running';
  const filePath = getInputFilePath(part) || '';
  const filename = getFilename(filePath);
  const directory = filePath.includes('/') || filePath.includes('\\') ? getDirectory(filePath) : '';
  const fileDiff = getFileDiff(part);
  const title = part.tool === 'edit' ? 'Edit' : 'Write';

  return {
    title: isPending ? getRunningLabel(part.tool) : title,
    subtitle: !isPending && filename ? filename : undefined,
    args: !isPending && directory ? [directory] : undefined,
    action: !isPending && fileDiff ? <DiffChanges changes={fileDiff} /> : undefined,
  };
}

function buildApplyPatchTrigger(part: ToolPart, files: ApplyPatchFile[]): TriggerTitle {
  const isPending = part.state?.status === 'pending' || part.state?.status === 'running';
  const single = files.length === 1 ? files[0] : undefined;

  if (single) {
    const filename = getFilename(single.relativePath);
    const directory = single.relativePath.includes('/') ? getDirectory(single.relativePath) : '';

    return {
      title: isPending ? getRunningLabel('apply_patch') : 'Patch',
      subtitle: !isPending && filename ? filename : undefined,
      args: !isPending && directory ? [directory] : undefined,
      action: !isPending ? <DiffChanges changes={{ additions: single.additions, deletions: single.deletions }} /> : undefined,
    };
  }

  const subtitle = files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''}` : '';
  return {
    title: isPending ? getRunningLabel('apply_patch') : 'Patch',
    subtitle: isPending ? undefined : subtitle,
  };
}

// ToolPartView

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

  // Inline tools
  if (isInline) {
    const triggerTitle = buildTriggerTitle(part);
    const icon = getToolIconName(part.tool);
    const content = hasContent ? (
      <div className="pl-7 mt-1 space-y-1">
        <ToolContentBody
          part={part}
          output={output}
          error={error}
          attachments={attachments}
          loadedFiles={loadedFiles}
          maxOutputLines={3}
        />
      </div>
    ) : undefined;

    return (
      <BasicTool
        icon={icon}
        trigger={triggerTitle}
        status={status}
        defaultOpen={false}
        hideDetails={!hasContent}
      >
        {content}
      </BasicTool>
    );
  }

  // Apply Patch
  if (part.tool === 'apply_patch') {
    const files = getApplyPatchFiles(part);
    const defaultOpen = status === 'completed' && editExpanded;
    const trigger = buildApplyPatchTrigger(part, files);
    const hasContent = files.length > 0 ||
      (status === 'error' && part.state && 'error' in part.state) ||
      (status === 'completed' && part.state && 'output' in part.state);

    return (
      <div data-component="apply-patch-tool">
        <BasicTool
          icon="code-lines"
          trigger={trigger}
          status={status}
          defaultOpen={defaultOpen && hasContent}
          defer
        >
          {hasContent ? <ApplyPatchContent part={part} files={files} /> : undefined}
        </BasicTool>
      </div>
    );
  }

  // Edit/Write
  if (part.tool === 'edit' || part.tool === 'write') {
    const defaultOpen = status === 'completed' && editExpanded;
    const trigger = buildEditTrigger(part);

    return (
      <div data-component={part.tool === 'edit' ? 'edit-tool' : 'write-tool'}>
        <BasicTool
          icon="code-lines"
          trigger={trigger}
          status={status}
          defaultOpen={defaultOpen}
          defer
        >
          {part.tool === 'edit' ? (
            <EditToolContent part={part} />
          ) : (
            <WriteToolContent part={part} />
          )}
        </BasicTool>
      </div>
    );
  }

  // Bash
  if (part.tool === 'bash') {
    const defaultOpen = status === 'completed' && shellExpanded;
    const title = isPending ? getRunningLabel(part.tool) : getCompletedTitle(part);
    const bashSubtitle = isPending ? undefined : getSubtitle(part);
    const bashTrigger: TriggerTitle = {
      title,
      subtitle: undefined,
      action: bashSubtitle && bashSubtitle !== title ? (
        <ShellSubmessage text={bashSubtitle} animated={!isPending} />
      ) : undefined,
    };

    return (
      <div data-component="bash-tool">
        <BasicTool
          icon="console"
          trigger={bashTrigger}
          status={status}
          defaultOpen={defaultOpen}
        >
          <BashToolContent part={part} />
        </BasicTool>
      </div>
    );
  }

  // TodoWrite
  if (part.tool === 'todowrite') {
    const todos = getTodos(part);
    const completed = todos.filter((t) => t.status === 'completed').length;
    const subtitle = todos.length > 0 ? `${completed}/${todos.length}` : undefined;

    return (
      <div data-component="todowrite-tool">
        <BasicTool
          icon="checklist"
          trigger={{ title: 'Todos', subtitle }}
          status={status}
          locked
          forceOpen
        >
          {!isPending && <TodoWriteToolContent part={part} />}
        </BasicTool>
      </div>
    );
  }

  // Question
  if (part.tool === 'question') {
    const questionError = status === 'error' && 'error' in part.state ? (part.state.error as string) : null;
    const isDismissed = questionError?.replace('Error: ', '').includes('dismissed this question');
    const triggerTitle = buildTriggerTitle(part);

    if (isDismissed) {
      return (
        <div data-component="question-tool">
          <BasicTool
            icon="bubble-5"
            trigger={triggerTitle}
            status={status}
            hideDetails
          />
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
        <BasicTool
          icon="bubble-5"
          trigger={triggerTitle}
          status={status}
          defaultOpen={completed}
        >
          <QuestionToolContent part={part} />
        </BasicTool>
      </div>
    );
  }

  // Task/subagent
  if (part.tool === 'task') {
    const { subagentType, description } = getTaskInfo(part);
    const title = `Agent${subagentType ? `: ${subagentType}` : ''}`;

    return (
      <div data-component="task-tool">
        <BasicTool
          icon="task"
          trigger={{ title, subtitle: description }}
          status={status}
          hideDetails
        />
      </div>
    );
  }

  // Fallback for unknown block tools
  const defaultOpen = status === 'completed' && hasContent;
  const triggerTitle = buildTriggerTitle(part);
  const icon = getToolIconName(part.tool);

  return (
    <BasicTool
      icon={icon}
      trigger={triggerTitle}
      status={status}
      defaultOpen={defaultOpen}
    >
      {hasContent && (
        <div className="pl-7 mt-1 space-y-1">
          <ToolContentBody
            part={part}
            output={output}
            error={error}
            attachments={attachments}
            loadedFiles={loadedFiles}
            maxOutputLines={part.tool === 'bash' ? 10 : 3}
          />
        </div>
      )}
    </BasicTool>
  );
}

function ToolError({ tool, error }: { tool: string; error: string }) {
  return <ToolErrorCard tool={tool} error={error} />;
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
      {error && <ToolError tool={part.tool} error={error} />}
    </>
  );
}

// Context Tool Grouping

function contextToolSummary(parts: ToolPart[]) {
  return {
    read: parts.filter((p) => p.tool === 'read').length,
    search: parts.filter((p) => p.tool === 'glob' || p.tool === 'grep').length,
    list: parts.filter((p) => p.tool === 'list').length,
  };
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

  const _getFilename = (p: string) => p.split(/[/\\]/).pop() || p;
  const _getDirectory = (p: string) => {
    const parts = p.split(/[/\\]/);
    return parts.length > 1 ? parts.slice(-2).join('/') : parts.pop() || p;
  };

  switch (part.tool) {
    case 'read': {
      const args: string[] = [];
      if (offset !== undefined) args.push('offset=' + offset);
      if (limit !== undefined) args.push('limit=' + limit);
      return { title: 'Read', subtitle: filePath ? _getFilename(filePath) : undefined, args };
    }
    case 'list':
      return { title: 'List', subtitle: _getDirectory(path) };
    case 'glob':
      return { title: 'Glob', subtitle: _getDirectory(path), args: pattern ? ['pattern=' + pattern] : [] };
    case 'grep': {
      const args: string[] = [];
      if (pattern) args.push('pattern=' + pattern);
      if (include) args.push('include=' + include);
      return { title: 'Grep', subtitle: _getDirectory(path), args };
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
  const summary = useMemo(() => contextToolSummary(parts), [parts]);

  return (
    <Collapsible defaultOpen={false}>
      <Collapsible.Trigger className="w-full">
        <div data-component="context-tool-group-trigger">
          <span data-slot="context-tool-group-title">
            <span data-slot="context-tool-group-label">
              <ToolStatusTitle
                active={pending}
                activeText="Gathering context..."
                doneText="Gathered context"
                split={false}
              />
            </span>
            <span data-slot="context-tool-group-summary">
              <AnimatedCountList
                items={[
                  { key: 'read', count: summary.read, one: '{{count}} read', other: '{{count}} reads' },
                  { key: 'search', count: summary.search, one: '{{count}} search', other: '{{count}} searches' },
                  { key: 'list', count: summary.list, one: '{{count}} list', other: '{{count}} lists' },
                ]}
                fallback=""
              />
            </span>
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
                    <TextShimmer text={info.title} active={running} />
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

