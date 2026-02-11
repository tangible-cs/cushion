import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { ArrowUp, Brain, File as FileIcon, Image as ImageIcon, StopCircle, Terminal } from 'lucide-react';
import type { Agent } from '@opencode-ai/sdk/v2/client';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  useChatStore,
  getModelVariantOptions,
  type PromptAttachment,
  type PromptContextItem,
  type PromptInputPayload,
} from '@/stores/chatStore';
import { Icon } from './Icon';
import { SessionContextUsage } from './SessionContextUsage';
import { ModelSelector } from './ModelSelector';
import { LocalAIButton } from './LocalAIButton';
import { AgentSelector } from './AgentSelector';
import { useToast } from './Toast';
import { searchFiles } from '@/lib/wiki-link-resolver';
import { formatShortcutList, matchShortcut, useShortcutBindings } from '@/lib/shortcuts';

// Utility functions for path handling (like OpenCode)

const CHAT_SHORTCUT_IDS = [
  'chat.shell.exit',
  'chat.suggestions.next',
  'chat.suggestions.prev',
  'chat.suggestions.confirm',
  'chat.suggestions.close',
  'chat.session.abort',
  'chat.newline',
  'chat.submit',
] as const;
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
}

function getFilename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(lastSlash + 1) : filePath;
}

function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

type PromptInputProps = {
  disabled?: boolean;
  placeholder?: string;
  onSubmit?: (value: PromptInputPayload) => void;
  className?: string;
  editorClassName?: string;
  editorWrapperClassName?: string;
};

const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const ZERO_WIDTH_SPACE = '\u200B';
const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
const COMPACT_LEVEL_MAX = COMPACT_LABEL_LENGTHS.length - 1;
const COMPACT_STEP_RATIO = 0.16;
const COMPACT_STEP_MIN = 56;
const VARIANT_SIZE_CLASSES = [
  'max-w-[160px] px-2.5',
  'max-w-[16ch] px-2.5',
  'max-w-[12ch] px-2',
  'max-w-[7ch] px-2',
] as const;

function resolveCompactLevel(overflow: number, fullWidth: number): number {
  if (overflow <= 0 || fullWidth <= 0) return 0;
  const step = Math.max(COMPACT_STEP_MIN, Math.round(fullWidth * COMPACT_STEP_RATIO));
  if (overflow <= step * 0.5) return 0;
  if (overflow <= step * 1.2) return 1;
  if (overflow <= step * 2) return 2;
  return Math.min(3, COMPACT_LEVEL_MAX);
}

type TriggerType = 'command' | 'mention';

type TriggerState = {
  type: TriggerType;
  query: string;
  start: number;
};

type SuggestionItem = {
  id: string;
  label: string;
  value: string;
  description?: string;
  type: TriggerType;
  path?: string;
  agent?: string;
  group?: 'agent' | 'recent' | 'search' | 'default';
};

type MentionOption =
  | { type: 'agent'; name: string; display: string }
  | { type: 'file'; path: string; display: string; recent?: boolean };

const BUILTIN_COMMANDS: SuggestionItem[] = [
  { id: 'undo', label: '/undo', value: '/undo', description: 'Undo last user message', type: 'command' },
  { id: 'redo', label: '/redo', value: '/redo', description: 'Redo last undone message', type: 'command' },
  { id: 'compact', label: '/compact', value: '/compact', description: 'Compact this session', type: 'command' },
  { id: 'summarize', label: '/summarize', value: '/summarize', description: 'Compact this session', type: 'command' },
  { id: 'share', label: '/share', value: '/share', description: 'Share this session', type: 'command' },
  { id: 'unshare', label: '/unshare', value: '/unshare', description: 'Unshare this session', type: 'command' },
  { id: 'clear', label: '/clear', value: '/clear', description: 'Clear the input', type: 'command' },
  { id: 'reset', label: '/reset', value: '/reset', description: 'Clear input and context', type: 'command' },
];

type TextPart = {
  type: 'text';
  content: string;
  start: number;
  end: number;
};

type FilePart = {
  type: 'file';
  content: string;
  path: string;
  start: number;
  end: number;
};

type AgentPart = {
  type: 'agent';
  content: string;
  name: string;
  start: number;
  end: number;
};

type PromptPart = TextPart | FilePart | AgentPart;

type InsertPart =
  | { type: 'text'; content: string }
  | { type: 'file'; content: string; path: string }
  | { type: 'agent'; content: string; name: string };

type InlineToken = {
  raw: string;
  token: string;
  start: number;
  end: number;
};

const DEFAULT_PROMPT: PromptPart[] = [{ type: 'text', content: '', start: 0, end: 0 }];

const parseInlineTokens = (text: string): InlineToken[] => {
  const matches: InlineToken[] = [];
  const regex = /@([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0];
    const token = match[1] ?? '';
    if (!token) continue;
    const start = match.index ?? 0;
    matches.push({ raw, token, start, end: start + raw.length });
  }
  return matches;
};

const buildPromptParts = (text: string, contextItems: PromptContextItem[], agents: Agent[]): PromptPart[] => {
  if (!text) return DEFAULT_PROMPT;

  const tokens = parseInlineTokens(text);
  if (tokens.length === 0) {
    return [{ type: 'text', content: text, start: 0, end: text.length }];
  }

  const agentMap = new Map(
    agents
      .filter((agent) => !agent.hidden && agent.mode !== 'primary')
      .map((agent) => [agent.name.toLowerCase(), agent.name])
  );
  const fileMap = new Map<string, PromptContextItem[]>();

  for (const item of contextItems) {
    const name = item.path.split(/[/\\]/).pop() || item.path;
    const key = name.toLowerCase();
    const list = fileMap.get(key);
    if (list) {
      list.push(item);
    } else {
      fileMap.set(key, [item]);
    }
    const normalizedPath = item.path.replace(/\\/g, '/').toLowerCase();
    if (!fileMap.has(normalizedPath)) {
      fileMap.set(normalizedPath, [item]);
    }
  }

  const fileIndices = new Map<string, number>();
  const resolved: Array<
    | { type: 'agent'; name: string; raw: string; start: number; end: number }
    | { type: 'file'; path: string; raw: string; start: number; end: number }
  > = [];

  for (const token of tokens) {
    const key = token.token.toLowerCase();
    const agentName = agentMap.get(key);
    if (agentName) {
      resolved.push({ type: 'agent', name: agentName, raw: token.raw, start: token.start, end: token.end });
      continue;
    }
    const files = fileMap.get(key);
    if (!files || files.length === 0) continue;
    const index = fileIndices.get(key) ?? 0;
    const item = files[index] ?? files[0];
    fileIndices.set(key, index + 1);
    resolved.push({ type: 'file', path: item.path, raw: token.raw, start: token.start, end: token.end });
  }

  if (resolved.length === 0) {
    return [{ type: 'text', content: text, start: 0, end: text.length }];
  }

  const parts: PromptPart[] = [];
  let cursor = 0;
  let position = 0;

  for (const item of resolved) {
    if (item.start > cursor) {
      const segment = text.slice(cursor, item.start);
      if (segment) {
        parts.push({ type: 'text', content: segment, start: position, end: position + segment.length });
        position += segment.length;
      }
    }
    const length = item.raw.length;
    if (item.type === 'agent') {
      parts.push({
        type: 'agent',
        name: item.name,
        content: item.raw,
        start: position,
        end: position + length,
      });
    }
    if (item.type === 'file') {
      parts.push({
        type: 'file',
        path: item.path,
        content: item.raw,
        start: position,
        end: position + length,
      });
    }
    position += length;
    cursor = item.end;
  }

  if (cursor < text.length) {
    const tail = text.slice(cursor);
    if (tail) {
      parts.push({ type: 'text', content: tail, start: position, end: position + tail.length });
    }
  }

  return parts.length > 0 ? parts : DEFAULT_PROMPT;
};

const isPromptEqual = (left: PromptPart[], right: PromptPart[]) => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a.type !== b.type) return false;
    if (a.content !== b.content) return false;
    if (a.type === 'file' && (b as FilePart).path !== a.path) return false;
    if (a.type === 'agent' && (b as AgentPart).name !== a.name) return false;
  }
  return true;
};

const createTextFragment = (content: string): DocumentFragment => {
  const fragment = document.createDocumentFragment();
  const segments = content.split('\n');
  segments.forEach((segment, index) => {
    if (segment) {
      fragment.appendChild(document.createTextNode(segment));
    } else if (segments.length > 1) {
      fragment.appendChild(document.createTextNode(ZERO_WIDTH_SPACE));
    }
    if (index < segments.length - 1) {
      fragment.appendChild(document.createElement('br'));
    }
  });
  return fragment;
};

const createPill = (part: { type: 'file' | 'agent'; content: string; path?: string; name?: string }): HTMLElement => {
  const pill = document.createElement('span');
  pill.textContent = part.content;
  pill.setAttribute('data-type', part.type);
  if (part.type === 'file' && part.path) pill.setAttribute('data-path', part.path);
  if (part.type === 'agent' && part.name) pill.setAttribute('data-name', part.name);
  pill.setAttribute('contenteditable', 'false');
  pill.style.userSelect = 'text';
  pill.style.cursor = 'default';
  return pill;
};

const getNodeLength = (node: Node): number => {
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') return 1;
  return (node.textContent ?? '').replace(/\u200B/g, '').length;
};

const getTextLength = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200B/g, '').length;
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') return 1;
  let length = 0;
  for (const child of Array.from(node.childNodes)) {
    length += getTextLength(child);
  }
  return length;
};

const getCursorPosition = (parent: HTMLElement): number => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!parent.contains(range.startContainer)) return 0;
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(parent);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return getTextLength(preCaretRange.cloneContents());
};

const setCursorPosition = (parent: HTMLElement, position: number) => {
  let remaining = position;
  let node = parent.firstChild;
  while (node) {
    const length = getNodeLength(node);
    const isText = node.nodeType === Node.TEXT_NODE;
    const isPill =
      node.nodeType === Node.ELEMENT_NODE
      && ((node as HTMLElement).dataset.type === 'file' || (node as HTMLElement).dataset.type === 'agent');
    const isBreak = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR';

    if (isText && remaining <= length) {
      const range = document.createRange();
      const selection = window.getSelection();
      range.setStart(node, remaining);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    if ((isPill || isBreak) && remaining <= length) {
      const range = document.createRange();
      const selection = window.getSelection();
      if (remaining === 0) {
        range.setStartBefore(node);
      }
      if (remaining > 0 && isPill) {
        range.setStartAfter(node);
      }
      if (remaining > 0 && isBreak) {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          range.setStart(next, 0);
        }
        if (!next || next.nodeType !== Node.TEXT_NODE) {
          range.setStartAfter(node);
        }
      }
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }

    remaining -= length;
    node = node.nextSibling;
  }

  const fallbackRange = document.createRange();
  const fallbackSelection = window.getSelection();
  const last = parent.lastChild;
  if (last && last.nodeType === Node.TEXT_NODE) {
    const len = last.textContent ? last.textContent.length : 0;
    fallbackRange.setStart(last, len);
  }
  if (!last || last.nodeType !== Node.TEXT_NODE) {
    fallbackRange.selectNodeContents(parent);
  }
  fallbackRange.collapse(false);
  fallbackSelection?.removeAllRanges();
  fallbackSelection?.addRange(fallbackRange);
};

const setRangeEdge = (parent: HTMLElement, range: Range, edge: 'start' | 'end', offset: number) => {
  let remaining = offset;
  const nodes = Array.from(parent.childNodes);

  for (const node of nodes) {
    const length = getNodeLength(node);
    const isText = node.nodeType === Node.TEXT_NODE;
    const isPill =
      node.nodeType === Node.ELEMENT_NODE
      && ((node as HTMLElement).dataset.type === 'file' || (node as HTMLElement).dataset.type === 'agent');
    const isBreak = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR';

    if (isText && remaining <= length) {
      if (edge === 'start') range.setStart(node, remaining);
      if (edge === 'end') range.setEnd(node, remaining);
      return;
    }

    if ((isPill || isBreak) && remaining <= length) {
      if (edge === 'start' && remaining === 0) range.setStartBefore(node);
      if (edge === 'start' && remaining > 0) range.setStartAfter(node);
      if (edge === 'end' && remaining === 0) range.setEndBefore(node);
      if (edge === 'end' && remaining > 0) range.setEndAfter(node);
      return;
    }

    remaining -= length;
  }
};

const parseFromDOM = (editor: HTMLElement): PromptPart[] => {
  const parts: PromptPart[] = [];
  let position = 0;
  let buffer = '';

  const flushText = () => {
    const content = buffer.replace(/\r\n?/g, '\n').replace(/\u200B/g, '');
    buffer = '';
    if (!content) return;
    parts.push({ type: 'text', content, start: position, end: position + content.length });
    position += content.length;
  };

  const pushFile = (file: HTMLElement) => {
    const content = file.textContent ?? '';
    const path = file.dataset.path ?? content;
    parts.push({ type: 'file', path, content, start: position, end: position + content.length });
    position += content.length;
  };

  const pushAgent = (agent: HTMLElement) => {
    const content = agent.textContent ?? '';
    const name = agent.dataset.name ?? content.replace(/^@/, '');
    parts.push({ type: 'agent', name, content, start: position, end: position + content.length });
    position += content.length;
  };

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (element.dataset.type === 'file') {
      flushText();
      pushFile(element);
      return;
    }
    if (element.dataset.type === 'agent') {
      flushText();
      pushAgent(element);
      return;
    }
    if (element.tagName === 'BR') {
      buffer += '\n';
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      visit(child);
    }
  };

  const children = Array.from(editor.childNodes);
  children.forEach((child, index) => {
    const isBlock = child.nodeType === Node.ELEMENT_NODE && ['DIV', 'P'].includes((child as HTMLElement).tagName);
    visit(child);
    if (isBlock && index < children.length - 1) {
      buffer += '\n';
    }
  });

  flushText();

  return parts.length > 0 ? parts : DEFAULT_PROMPT;
};

const isNormalizedEditor = (editor: HTMLElement) =>
  Array.from(editor.childNodes).every((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text.includes(ZERO_WIDTH_SPACE)) return true;
      if (text !== ZERO_WIDTH_SPACE) return false;

      const prev = node.previousSibling;
      const next = node.nextSibling;
      const prevIsBr = prev?.nodeType === Node.ELEMENT_NODE && (prev as HTMLElement).tagName === 'BR';
      const nextIsBr = next?.nodeType === Node.ELEMENT_NODE && (next as HTMLElement).tagName === 'BR';
      if (!prevIsBr && !nextIsBr) return false;
      if (nextIsBr && !prevIsBr && prev) return false;
      return true;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const element = node as HTMLElement;
    if (element.dataset.type === 'file') return true;
    if (element.dataset.type === 'agent') return true;
    return element.tagName === 'BR';
  });

// Helper to generate unique ID
const createId = () => Math.random().toString(36).substring(2, 9);

// Helper to read file as data URL
const readAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export function PromptInput({
  disabled,
  placeholder,
  onSubmit,
  className,
  editorClassName,
  editorWrapperClassName,
}: PromptInputProps) {
  const promptText = useChatStore((state) => state.promptText);
  const setPromptText = useChatStore((state) => state.setPromptText);
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const mirror = useRef({ input: false });
  const footerRef = useRef<HTMLDivElement | null>(null);
  const leftControlsRef = useRef<HTMLDivElement | null>(null);
  const rightControlsRef = useRef<HTMLDivElement | null>(null);
  const chatShortcuts = useShortcutBindings(CHAT_SHORTCUT_IDS);
  const fullLeftWidthRef = useRef(0);
  const contextItems = useChatStore((state) => state.contextItems);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const directory = useChatStore((state) => state.directory);
  const abortSession = useChatStore((state) => state.abortSession);
  const undoSession = useChatStore((state) => state.undoSession);
  const redoSession = useChatStore((state) => state.redoSession);
  const compactSession = useChatStore((state) => state.compactSession);
  const shareSession = useChatStore((state) => state.shareSession);
  const unshareSession = useChatStore((state) => state.unshareSession);
  const removeContextItem = useChatStore((state) => state.removeContextItem);
  const clearContextItems = useChatStore((state) => state.clearContextItems);
  const addContextItem = useChatStore((state) => state.addContextItem);
  const agents = useChatStore((state) => state.agents);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const selectedVariant = useChatStore((state) => state.selectedVariant);
  const setSelectedVariant = useChatStore((state) => state.setSelectedVariant);
  const commands = useChatStore((state) => state.commands);
  const { showToast } = useToast();
  const openFiles = useWorkspaceStore((state) => state.openFiles);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileSearchResults, setFileSearchResults] = useState<string[]>([]);
  const [history, setHistory] = useState({ normal: [] as string[], shell: [] as string[] });
  const [historyIndex, setHistoryIndex] = useState({ normal: -1, shell: -1 });
  const [draft, setDraft] = useState({ normal: '', shell: '' });
  const [composing, setComposing] = useState(false);
  const [compactLevel, setCompactLevel] = useState(0);
  const sessionStatus = useChatStore((state) => state.sessionStatus);
  const status = activeSessionId ? sessionStatus[activeSessionId] : undefined;
  const working = status?.type === 'busy' || status?.type === 'retry';

  useEffect(() => {
    setAttachments([]);
  }, [activeSessionId, directory]);

  const workspaceMetadata = useWorkspaceStore((state) => state.metadata);
  const fileTree = useWorkspaceStore((state) => state.fileTree);

  const searchWorkspaceFiles = useCallback((query: string): string[] => {
    if (!workspaceMetadata || !query || fileTree.length === 0) return [];
    return searchFiles(query, fileTree, 20).map((p: string) => p.replace(/\\/g, '/'));
  }, [workspaceMetadata, fileTree]);

  useEffect(() => {
    if (trigger?.type === 'mention' && trigger.query.length > 0 && workspaceMetadata) {
      const debouncedSearch = setTimeout(() => {
        setFileSearchResults(searchWorkspaceFiles(trigger.query));
      }, 150);
      return () => clearTimeout(debouncedSearch);
    } else {
      setFileSearchResults([]);
    }
  }, [trigger?.query, trigger?.type, workspaceMetadata, searchWorkspaceFiles]);

  const recentFiles = useMemo(() => {
    return Array.from(openFiles.keys()).map((key) => String(key).replace(/\\/g, '/'));
  }, [openFiles]);

  const agentSuggestions = useMemo(() => {
    return agents
      .filter((agent) => !agent.hidden && agent.mode !== 'primary')
      .map((agent) => ({
        id: `agent-${agent.name}`,
        label: `@${agent.name}`,
        value: `@${agent.name}`,
        description: agent.description,
        type: 'mention' as const,
        agent: agent.name,
        group: 'agent' as const,
      }));
  }, [agents]);

  const fileSuggestions = useMemo(() => {
    const recentSuggestions = recentFiles
      .filter((path) => !fileSearchResults.includes(path))
      .map((path) => ({
        id: path,
        label: `@${path}`,
        value: `@${path}`,
        description: path,
        type: 'mention' as const,
        path,
        group: 'recent' as const,
      }));

    const searchSuggestions = fileSearchResults
      .filter((path) => !recentFiles.includes(path))
      .map((path) => ({
        id: `search-${path}`,
        label: `@${path}`,
        value: `@${path}`,
        description: path,
        type: 'mention' as const,
        path,
        group: 'search' as const,
      }));

    return [...recentSuggestions, ...searchSuggestions];
  }, [recentFiles, fileSearchResults]);

  const commandSuggestions = useMemo(() => {
    const builtinIds = new Set(BUILTIN_COMMANDS.map((item) => item.id));
    const dynamic = commands
      .filter((command) => !builtinIds.has(command.name))
      .map((command) => {
        const template = command.template?.trim() ?? '';
        const value = template ? `/${command.name} ${template}` : `/${command.name}`;
        return {
          id: `cmd-${command.name}`,
          label: `/${command.name}`,
          value,
          description: command.description,
          type: 'command' as const,
        };
      });
    return [...BUILTIN_COMMANDS, ...dynamic];
  }, [commands]);
 
  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();
    if (trigger.type === 'command') {
      return commandSuggestions.filter((item) => item.label.toLowerCase().includes(query));
    }

    const needle = query;
    const allSuggestions = [...agentSuggestions, ...fileSuggestions];

    if (!needle) {
      return allSuggestions.filter((item) =>
        !('group' in item && item.group === 'search')
      );
    }

    const results = fuzzysort.go(needle, allSuggestions, {
      key: 'label',
      limit: 20,
    });

    return results.map((r) => r.obj);
  }, [trigger, agentSuggestions, fileSuggestions, commandSuggestions]);


  const shellMode = promptText.startsWith('!');
  const variantOptions = useMemo(() => getModelVariantOptions(providers, selectedModel), [providers, selectedModel]);
  const variantLabel = useMemo(() => {
    if (variantOptions.length === 0) return null;
    if (!selectedVariant) return 'Default';
    const current = variantOptions.find((option) => option.key === selectedVariant);
    return current?.label ?? 'Default';
  }, [variantOptions, selectedVariant]);
  const compactVariantLabel = useMemo(() => {
    if (!variantLabel || compactLevel === 0) return null;
    const maxLength = COMPACT_LABEL_LENGTHS[Math.min(compactLevel, COMPACT_LEVEL_MAX)];
    return getCompactLabel(variantLabel, maxLength);
  }, [variantLabel, compactLevel]);

  const updateFooterCompact = useCallback(() => {
    if (shellMode) return;
    const footer = footerRef.current;
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!footer || !left || !right) return;
    const footerWidth = footer.getBoundingClientRect().width;
    const rightWidth = right.getBoundingClientRect().width;
    const available = footerWidth - rightWidth - 12;
    const measuredLeftWidth = left.scrollWidth;
    if (fullLeftWidthRef.current === 0) {
      fullLeftWidthRef.current = measuredLeftWidth;
    }
    const fullLeftWidth = fullLeftWidthRef.current || measuredLeftWidth;
    const overflow = fullLeftWidth - available;
    const nextLevel = resolveCompactLevel(overflow, fullLeftWidth);
    setCompactLevel((prev) => (prev === nextLevel ? prev : nextLevel));
  }, [shellMode]);

  useEffect(() => {
    if (shellMode || compactLevel > 0) return;
    const left = leftControlsRef.current;
    if (!left) return;
    fullLeftWidthRef.current = left.scrollWidth;
    updateFooterCompact();
  }, [shellMode, compactLevel, selectedAgent, agents.length, selectedModel?.providerID, selectedModel?.modelID, variantLabel, updateFooterCompact]);

  useEffect(() => {
    updateFooterCompact();
    const footer = footerRef.current;
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!footer || !left || !right) return;
    const observer = new ResizeObserver(updateFooterCompact);
    observer.observe(footer);
    observer.observe(left);
    observer.observe(right);
    return () => observer.disconnect();
  }, [updateFooterCompact]);

  const cycleVariant = useCallback(() => {
    if (variantOptions.length === 0) return;
    const keys = variantOptions.map((option) => option.key);
    const currentIndex = selectedVariant ? keys.indexOf(selectedVariant) + 1 : 0;
    const nextIndex = (currentIndex + 1) % (keys.length + 1);
    const nextVariant = nextIndex === 0 ? null : keys[nextIndex - 1];
    setSelectedVariant(nextVariant);
  }, [variantOptions, selectedVariant, setSelectedVariant]);
  const isEmptyPrompt = promptText.replace(/\u200B/g, '').trim().length === 0;
  const showPlaceholder = Boolean(placeholder) && isEmptyPrompt && attachments.length === 0;
  const submitDisabled = Boolean(disabled)
    || (!working && isEmptyPrompt && attachments.length === 0 && contextItems.length === 0);

  const renderEditor = (parts: PromptPart[]) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = '';
    for (const part of parts) {
      if (part.type === 'text') {
        editor.appendChild(createTextFragment(part.content));
        continue;
      }
      if (part.type === 'file' || part.type === 'agent') {
        editor.appendChild(createPill(part));
      }
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const parts = buildPromptParts(promptText, contextItems, agents);
    const domParts = parseFromDOM(editor);

    if (mirror.current.input) {
      mirror.current.input = false;
      if (isNormalizedEditor(editor) && isPromptEqual(parts, domParts)) return;
    }

    const selection = window.getSelection();
    let cursorPosition: number | null = null;
    if (selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
      cursorPosition = getCursorPosition(editor);
    }

    renderEditor(parts);

    if (cursorPosition !== null) {
      setCursorPosition(editor, cursorPosition);
    }
  }, [promptText, contextItems, agents]);

  const setTriggerState = (next: TriggerState | null) => {
    setTrigger((prev) => {
      if (!next && !prev) return prev;
      if (next && prev && next.type === prev.type && next.query === prev.query && next.start === prev.start) {
        return prev;
      }
      setActiveIndex(0);
      return next;
    });
  };

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return fallback;
  };

  const runLocalCommand = useCallback((id: string) => {
    if (id === 'clear') {
      setPromptText('');
      setTriggerState(null);
      return true;
    }
    if (id === 'reset') {
      setPromptText('');
      setAttachments([]);
      clearContextItems();
      setTriggerState(null);
      return true;
    }
    if (id === 'undo') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await undoSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to undo.'),
          });
        }
      })();
      return true;
    }
    if (id === 'redo') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await redoSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to redo.'),
          });
        }
      })();
      return true;
    }
    if (id === 'compact' || id === 'summarize') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await compactSession();
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to compact session.'),
          });
        }
      })();
      return true;
    }
    if (id === 'share') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          const url = await shareSession();
          if (!url) {
            showToast({
              variant: 'error',
              description: 'Share link unavailable.',
            });
            return;
          }
          await navigator.clipboard.writeText(url);
          showToast({
            variant: 'success',
            description: 'Share link copied to clipboard.',
          });
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to share session.'),
          });
        }
      })();
      return true;
    }
    if (id === 'unshare') {
      setPromptText('');
      setTriggerState(null);
      void (async () => {
        try {
          await unshareSession();
          showToast({
            variant: 'success',
            description: 'Session unshared.',
          });
        } catch (error) {
          showToast({
            variant: 'error',
            description: getErrorMessage(error, 'Failed to unshare session.'),
          });
        }
      })();
      return true;
    }
    return false;
  }, [
    clearContextItems,
    compactSession,
    getErrorMessage,
    redoSession,
    setAttachments,
    setPromptText,
    setTriggerState,
    shareSession,
    showToast,
    undoSession,
    unshareSession,
  ]);

  const updateTrigger = (rawText: string, cursorPosition: number) => {
    if (rawText.startsWith('!')) {
      setTriggerState(null);
      return;
    }
    const before = rawText.substring(0, cursorPosition);
    const atMatch = before.match(/@(\S*)$/);
    if (atMatch) {
      setTriggerState({ type: 'mention', query: atMatch[1], start: cursorPosition - atMatch[0].length });
      return;
    }
    const slashMatch = rawText.match(/^\/(\S*)$/);
    if (slashMatch) {
      setTriggerState({ type: 'command', query: slashMatch[1], start: 0 });
      return;
    }
    setTriggerState(null);
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const rawParts = parseFromDOM(editor);
    const rawText = rawParts.map((p) => p.content).join('');
    const trimmed = rawText.replace(/\u200B/g, '').trim();
    const hasNonText = rawParts.some((part) => part.type !== 'text');
    const shouldReset = trimmed.length === 0 && !hasNonText;

    if (shouldReset) {
      setTriggerState(null);
      if (promptText !== '') {
        mirror.current.input = true;
        setPromptText('');
      }
      return;
    }

    const cursorPosition = getCursorPosition(editor);
    updateTrigger(rawText, cursorPosition);

    if (rawText !== promptText) {
      mirror.current.input = true;
      setPromptText(rawText);
    }
  };

  const refreshTriggerFromSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const parts = parseFromDOM(editor);
    const rawText = parts.map((p) => p.content).join('');
    const cursorPosition = getCursorPosition(editor);
    updateTrigger(rawText, cursorPosition);
  };

  const addPart = (part: InsertPart) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const cursorPosition = getCursorPosition(editor);
    const range = selection.getRangeAt(0);

    if (part.type === 'file' || part.type === 'agent') {
      const pill = createPill(part);
      const gap = document.createTextNode(' ');
      const textBeforeCursor = parseFromDOM(editor)
        .map((p) => p.content)
        .join('')
        .substring(0, cursorPosition);
      const atMatch = textBeforeCursor.match(/@(\S*)$/);

      if (trigger?.type === 'mention') {
        setRangeEdge(editor, range, 'start', trigger.start);
        setRangeEdge(editor, range, 'end', cursorPosition);
      } else if (atMatch) {
        const start = atMatch.index ?? cursorPosition - atMatch[0].length;
        setRangeEdge(editor, range, 'start', start);
        setRangeEdge(editor, range, 'end', cursorPosition);
      }

      range.deleteContents();
      range.insertNode(gap);
      range.insertNode(pill);
      range.setStartAfter(gap);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      handleInput();
      return;
    }

    const fragment = createTextFragment(part.content);
    const last = fragment.lastChild;

    if (trigger?.type === 'command') {
      setRangeEdge(editor, range, 'start', trigger.start);
      setRangeEdge(editor, range, 'end', cursorPosition);
    }

    range.deleteContents();
    range.insertNode(fragment);
    if (last) {
      if (last.nodeType === Node.TEXT_NODE) {
        const text = last.textContent ?? '';
        if (text === ZERO_WIDTH_SPACE) {
          range.setStart(last, 0);
        }
        if (text !== ZERO_WIDTH_SPACE) {
          range.setStart(last, text.length);
        }
      }
      if (last.nodeType !== Node.TEXT_NODE) {
        range.setStartAfter(last);
      }
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    handleInput();
  };

  const handleSubmit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmed = promptText.trim();
    const localMatch = trimmed.match(/^\/(\S+)$/);
    if (localMatch && runLocalCommand(localMatch[1])) return;
    const isEmpty = trimmed.length === 0 && attachments.length === 0 && contextItems.length === 0;
    if (working && isEmpty) {
      abortSession().catch(() => undefined);
      return;
    }
    if (isEmpty) return;
    onSubmit?.({ text: promptText, attachments, mode: shellMode ? 'shell' : 'prompt' });
    if (trimmed.length > 0) {
      const key = shellMode ? 'shell' : 'normal';
      setHistory((prev) => {
        const list = prev[key];
        const last = list[list.length - 1];
        if (last === trimmed) return prev;
        return {
          ...prev,
          [key]: [...list, trimmed],
        };
      });
    }
    setHistoryIndex((prev) => (({
      ...prev,
      [shellMode ? 'shell' : 'normal']: -1,
    })));
    setDraft((prev) => (({
      ...prev,
      [shellMode ? 'shell' : 'normal']: '',
    })));
    setAttachments([]);
  };

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    const next: PromptAttachment[] = [];
    for (const file of files) {
      if (!SUPPORTED_TYPES.includes(file.type)) continue;
      const url = await readAsDataUrl(file);
      next.push({
        id: createId(),
        url,
        mime: file.type,
        filename: file.name,
      });
    }
    if (next.length === 0) return;
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleGlobalDragOver = (event: DragEvent) => {
      if (disabled) return;
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    };

    const handleGlobalDragLeave = (event: DragEvent) => {
      if (disabled) return;
      if (!event.relatedTarget) {
        setDragging(false);
      }
    };

    const handleGlobalDrop = (event: DragEvent) => {
      if (disabled) return;
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer?.files;
      if (dropped && dropped.length > 0) {
        void handleFiles(Array.from(dropped));
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [disabled, handleFiles]);

  useEffect(() => {
    if (!disabled) return;
    setDragging(false);
  }, [disabled]);

  const applySuggestion = (item: SuggestionItem) => {
    if (item.type === 'command') {
      const value = item.value.endsWith(' ') ? item.value : `${item.value} `;
      addPart({ type: 'text', content: value });
      setTriggerState(null);
      return;
    }

    if (item.path) {
      addContextItem({ path: item.path });
      addPart({ type: 'file', content: item.value, path: item.path });
      setTriggerState(null);
      return;
    }

    if (item.agent) {
      setSelectedAgent(item.agent);
      addPart({ type: 'agent', content: item.value, name: item.agent });
    }
    setTriggerState(null);
  };

  const handleCommandSelect = (item: SuggestionItem) => {
    if (runLocalCommand(item.id)) return;
    applySuggestion(item);
  };

  const focusEditorAt = (position: number) => {
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      setCursorPosition(editor, position);
      refreshTriggerFromSelection();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const isImeComposing = event.nativeEvent.isComposing || composing;
    const nativeEvent = event.nativeEvent;
    const editor = editorRef.current;
    if (!editor) return;

    if (event.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) {
        const node = selection.anchorNode;
        const offset = selection.anchorOffset;
        if (node && node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? '';
          if (/^\u200B+$/.test(text) && offset > 0) {
            const range = document.createRange();
            range.setStart(node, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }

    if (shellMode && matchShortcut(nativeEvent, chatShortcuts['chat.shell.exit'])) {
      event.preventDefault();
      const next = promptText.replace(/^!+/, '');
      setPromptText(next);
      setTriggerState(null);
      focusEditorAt(next.length);
      return;
    }

    if (shellMode && event.key === 'Backspace') {
      const caret = getCursorPosition(editor);
      if (promptText === '!' && caret <= 1) {
        event.preventDefault();
        setPromptText('');
        setTriggerState(null);
        focusEditorAt(0);
        return;
      }
    }

    if (suggestions.length > 0 && trigger) {
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.next'])) {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.prev'])) {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.confirm'])) {
        event.preventDefault();
        const item = suggestions[activeIndex];
        if (!item) return;
        if (item.type === 'command') {
          handleCommandSelect(item);
          return;
        }
        applySuggestion(item);
        return;
      }
      if (matchShortcut(nativeEvent, chatShortcuts['chat.suggestions.close'])) {
        event.preventDefault();
        setTriggerState(null);
        return;
      }
    }

    if (working && matchShortcut(nativeEvent, chatShortcuts['chat.session.abort'])) {
      event.preventDefault();
      abortSession().catch(() => undefined);
      return;
    }

    if (matchShortcut(nativeEvent, chatShortcuts['chat.newline'])) {
      addPart({ type: 'text', content: '\n' });
      event.preventDefault();
      return;
    }

    if (matchShortcut(nativeEvent, chatShortcuts['chat.submit'])) {
      if (isImeComposing) return;
      event.preventDefault();
      handleSubmit();
      return;
    }

    if (event.key === 'ArrowUp') {
      const caret = getCursorPosition(editor);
      if (caret !== 0) return;
      const key = shellMode ? 'shell' : 'normal';
      const list = history[key];
      if (list.length === 0) return;
      event.preventDefault();
      const currentIndex = historyIndex[key];
      const nextIndex = currentIndex < 0 ? list.length - 1 : Math.max(currentIndex - 1, 0);
      if (currentIndex < 0) {
        setDraft((prev) => ({ ...prev, [key]: promptText }));
      }
      setHistoryIndex((prev) => (({ ...prev, [key]: nextIndex })));
      const nextValue = list[nextIndex] ?? '';
      setPromptText(nextValue);
      focusEditorAt(nextValue.length);
      return;
    }

    if (event.key === 'ArrowDown') {
      const key = shellMode ? 'shell' : 'normal';
      const list = history[key];
      const currentIndex = historyIndex[key];
      if (currentIndex < 0) return;
      event.preventDefault();
      const nextIndex = currentIndex + 1;
      if (nextIndex >= list.length) {
        setHistoryIndex((prev) => (({ ...prev, [key]: -1 })));
        setPromptText(draft[key]);
        focusEditorAt(draft[key].length);
        return;
      }
      setHistoryIndex((prev) => (({ ...prev, [key]: nextIndex })));
      const nextValue = list[nextIndex] ?? '';
      setPromptText(nextValue);
      focusEditorAt(nextValue.length);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className={`relative flex flex-col gap-3 max-h-[320px] ${className ?? ''}`.trim()}>
      {trigger && (
        <div
          className="absolute inset-x-0 -top-3 -translate-y-full origin-bottom-left z-20
                 max-h-72 overflow-auto rounded-md border border-border bg-background shadow-md p-1 thin-scrollbar"
          onMouseDown={(event) => event.preventDefault()}
        >
          {(() => {
            const items = suggestions.slice(0, 20);

            return items.length > 0 ? (
              items.map((item) => {
                const isAgent = 'agent' in item && !!item.agent;
                const hasPath = 'path' in item && !!item.path;
                const agent = isAgent ? item.agent : undefined;
                const description = 'description' in item ? item.description : undefined;
                const filePath: string = hasPath && 'path' in item ? (item.path as string) : '';
                const dir = hasPath ? getDirectory(filePath) : '';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => (item.type === 'command' ? handleCommandSelect(item as SuggestionItem) : applySuggestion(item as SuggestionItem))}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-xs text-left text-muted-foreground"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'; e.currentTarget.style.color = 'var(--foreground)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = ''; }}
                  >
                    {isAgent ? (
                      <>
                        <Brain className="shrink-0 size-3.5" style={{ color: 'var(--md-accent)' }} />
                        <span className="truncate">{agent}</span>
                      </>
                    ) : hasPath ? (
                      <div className="flex items-baseline min-w-0 truncate">
                        {dir && (
                          <span className="text-muted-foreground">{dir}/</span>
                        )}
                        <span className="text-foreground">
                          {filePath.endsWith('/') ? filePath : getFilename(filePath)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-foreground">{item.label}</span>
                        {description && <span className="text-muted-foreground">{description}</span>}
                      </>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground">No results found</div>
            );
          })()}
        </div>
      )}
      <form
        data-slot="prompt-input-form"
        onSubmit={handleSubmit}
        className={`group/prompt-input relative flex flex-col overflow-hidden rounded-[14px] border border-border bg-background shadow-sm ${
          dragging ? 'border-dashed border-[var(--md-accent)]' : ''
        }`.trim()}
      >
        {dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageIcon className="size-8" />
              <span className="text-xs">Drop files to attach</span>
            </div>
          </div>
        )}
        {contextItems.length > 0 && (
          <div className="flex flex-nowrap items-center gap-1.5 px-3 pt-2.5 pb-0.5 overflow-x-auto thin-scrollbar">
            {contextItems.map((item) => {
              const selection = item.selection;
              const start = selection ? Math.min(selection.startLine, selection.endLine) : null;
              const end = selection ? Math.max(selection.startLine, selection.endLine) : null;
              const selectionLabel = selection
                ? start === end
                  ? `:${start}`
                  : `:${start}-${end}`
                : '';
              const dir = getDirectory(item.path);
              const filename = getFilename(item.path);

              return (
                <div
                  key={item.id}
                  title={item.path}
                  className="group shrink-0 flex items-center gap-1 rounded-md bg-muted/15 pl-2 pr-1 py-0.5 transition-colors hover:bg-muted/25"
                >
                  <FileIcon className="shrink-0 size-3 text-muted-foreground/50" />
                  <div className="flex items-baseline text-[12px] min-w-0">
                    {dir && (
                      <span className="text-muted-foreground/50 whitespace-nowrap truncate max-w-[80px] text-[11px]">
                        {dir}/
                      </span>
                    )}
                    <span className="text-foreground whitespace-nowrap font-medium">
                      {filename}
                    </span>
                    {selectionLabel && (
                      <span className="text-muted-foreground/60 whitespace-nowrap shrink-0 text-[11px]">{selectionLabel}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContextItem(item.id)}
                    className="ml-0.5 size-4 flex items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                    aria-label="Remove context"
                  >
                    <Icon name="close" size="small" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((attachment) => {
              const isImage = attachment.mime.startsWith('image/');
              return (
                <div key={attachment.id} className="relative group">
                  {isImage ? (
                    <img
                      src={attachment.url}
                      alt={attachment.filename}
                      className="size-16 rounded-md object-cover border border-border"
                    />
                  ) : (
                    <div className="size-16 rounded-md bg-muted/20 flex items-center justify-center border border-border">
                      <FileIcon className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove attachment"
                  >
                    <Icon name="close" size="small" className="text-muted-foreground" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/50 rounded-b-md">
                    <span className="text-[10px] text-white truncate block">{attachment.filename}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className={`relative max-h-[240px] overflow-y-auto thin-scrollbar ${editorWrapperClassName ?? ''}`.trim()}>
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            contentEditable={!disabled}
            data-slot="prompt-input-editor"
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={refreshTriggerFromSelection}
            onMouseUp={refreshTriggerFromSelection}
            onPaste={(event) => {
              const items = event.clipboardData?.files;
              if (items && items.length > 0) {
                event.preventDefault();
                void handleFiles(Array.from(items));
              }
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onBlur={() => setComposing(false)}
            className={`w-full min-h-[96px] whitespace-pre-wrap px-3 py-3 pr-12 text-sm text-foreground focus:outline-none ${
              shellMode ? 'font-mono' : ''
            } ${editorClassName ?? ''}`.trim()}
          />
          {showPlaceholder && (
            <div className="pointer-events-none absolute top-0 inset-x-0 px-3 py-3 pr-12 text-sm text-muted-foreground truncate">
              {placeholder}
            </div>
          )}
        </div>
        <div ref={footerRef} className="relative flex items-center justify-between px-3 py-2">
          <div ref={leftControlsRef} className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
            {shellMode ? (
              <div className="flex items-center gap-2 px-2 h-6 text-xs">
                <Terminal className="size-4 text-foreground" />
                <span className="text-foreground">Shell mode</span>
                <span className="text-muted-foreground">
                  {(() => {
                    const label = formatShortcutList(chatShortcuts['chat.shell.exit']);
                    return label ? `${label} to exit` : 'Exit';
                  })()}
                </span>
              </div>
            ) : (
              <>
                {agents.length > 0 && (
                  <AgentSelector disabled={disabled} compactLevel={compactLevel} />
                )}
                <ModelSelector disabled={disabled} compactLevel={compactLevel} />
                {variantOptions.length > 0 && variantLabel && (
                  <button
                    type="button"
                    onClick={cycleVariant}
                    disabled={disabled}
                    title={variantLabel}
                    className={`h-7 min-w-0 rounded-md border border-transparent bg-transparent text-sm text-muted-foreground hover:bg-[var(--border-subtle)] focus-visible:bg-[var(--border-subtle)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                      VARIANT_SIZE_CLASSES[Math.min(compactLevel, COMPACT_LEVEL_MAX)]
                    }`.trim()}
                    aria-label="Cycle thinking effort"
                  >
                    <span className="text-foreground truncate">
                      {compactVariantLabel ?? variantLabel}
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
          <div ref={rightControlsRef} className="flex items-center gap-1.5 shrink-0">
            <input
              ref={inputRef}
              type="file"
              accept={SUPPORTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleFiles([file]);
                e.currentTarget.value = '';
              }}
            />
            <LocalAIButton disabled={disabled} />
            <SessionContextUsage />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
              aria-label="Attach files"
            >
              <ImageIcon className="size-5" />
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="size-7 flex items-center justify-center rounded-[10px] text-white bg-[var(--md-accent)] shadow-sm ring-1 ring-white/25 hover:brightness-95 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label={working ? 'Stop' : 'Send'}
            >
              {working ? <StopCircle className="size-4.5" /> : <ArrowUp className="size-4.5" />}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
