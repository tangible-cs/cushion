import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import fuzzysort from 'fuzzysort';
import { Brain, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import type { Agent } from '@opencode-ai/sdk/v2/client';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  useChatStore,
  type PromptAttachment,
  type PromptContextItem,
  type PromptInputPayload,
} from '@/stores/chatStore';
import { Icon } from './Icon';

// Utility functions for path handling (like OpenCode)
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash) : '';
}

function getFilename(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(lastSlash + 1) : filePath;
}

function getFilenameTruncated(filePath: string, maxLength = 14): string {
  const name = getFilename(filePath);
  if (name.length <= maxLength) return name;
  if (maxLength <= 3) return name.slice(0, maxLength);
  return `${name.slice(0, maxLength - 3)}...`;
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

const COMMANDS: SuggestionItem[] = [
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
  const contextItems = useChatStore((state) => state.contextItems);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const directory = useChatStore((state) => state.directory);
  const removeContextItem = useChatStore((state) => state.removeContextItem);
  const clearContextItems = useChatStore((state) => state.clearContextItems);
  const addContextItem = useChatStore((state) => state.addContextItem);
  const agents = useChatStore((state) => state.agents);
  const selectedAgent = useChatStore((state) => state.selectedAgent);
  const setSelectedAgent = useChatStore((state) => state.setSelectedAgent);
  const providers = useChatStore((state) => state.providers);
  const providerDefaults = useChatStore((state) => state.providerDefaults);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const commands = useChatStore((state) => state.commands);
  const openFiles = useWorkspaceStore((state) => state.openFiles);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [fileSearchResults, setFileSearchResults] = useState<string[]>([]);
  const [isSearchingFiles, setIsSearchingFiles] = useState(false);
  const [history, setHistory] = useState({ normal: [] as string[], shell: [] as string[] });
  const [historyIndex, setHistoryIndex] = useState({ normal: -1, shell: -1 });
  const [draft, setDraft] = useState({ normal: '', shell: '' });
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    setAttachments([]);
  }, [activeSessionId, directory]);

  // Get client from chatStore for workspace search
  const client = useChatStore((state) => state.client);

  // Search files in workspace via SDK
  const searchWorkspaceFiles = useCallback(async (query: string): Promise<string[]> => {
    const currentClient = useChatStore.getState().client;
    const currentDirectory = useChatStore.getState().directory;
    if (!currentClient || !currentDirectory || !query) return [];
    try {
      setIsSearchingFiles(true);
      const response = await currentClient.find.files({ query, dirs: 'true' });
      return (response.data ?? []).map((path: string) => path.replace(/\\/g, '/'));
    } catch {
      return [];
    } finally {
      setIsSearchingFiles(false);
    }
  }, []); // No deps - we get fresh state from getState()

  // Trigger file search when @ mention query changes
  useEffect(() => {
    if (trigger?.type === 'mention' && trigger.query.length > 0 && client && directory) {
      const debouncedSearch = setTimeout(() => {
        void searchWorkspaceFiles(trigger.query).then(setFileSearchResults);
      }, 150);
      return () => clearTimeout(debouncedSearch);
    } else {
      setFileSearchResults([]);
    }
  }, [trigger?.query, trigger?.type, client, directory, searchWorkspaceFiles]);

  // Recent files from openFiles (for @ mention)
  const recentFiles = useMemo(() => {
    return Array.from(openFiles.keys()).map((key) => String(key).replace(/\\/g, '/'));
  }, [openFiles]);

  // Agent suggestions (for @ mention)
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

  // File suggestions with grouping (recent + search results)
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
    const dynamic = commands.map((command) => {
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
    return [...COMMANDS, ...dynamic];
  }, [commands]);

  const selectedProviderId = selectedModel?.providerID ?? '';
  const provider = providers.find((item) => item.id === selectedProviderId);
  const modelOptions = provider ? Object.keys(provider.models ?? {}) : [];

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();
    if (trigger.type === 'command') {
      return commandSuggestions.filter((item) => item.label.toLowerCase().includes(query));
    }

    // Use fuzzysort for fuzzy matching (like OpenCode)
    const needle = query;
    const allSuggestions = [...agentSuggestions, ...fileSuggestions];

    if (!needle) {
      // No query: return agents + recent files only (no search results when empty)
      return allSuggestions.filter((item) =>
        !('group' in item && item.group === 'search')
      );
    }

    // Fuzzy sort with display/key matching
    const results = fuzzysort.go(needle, allSuggestions, {
      key: 'label',
      limit: 20,
    });

    return results.map((r) => r.obj);
  }, [trigger, agentSuggestions, fileSuggestions, commandSuggestions]);


  const shellMode = promptText.startsWith('!');
  const isEmptyPrompt = promptText.replace(/\u200B/g, '').trim().length === 0;
  const showPlaceholder = Boolean(placeholder) && isEmptyPrompt && attachments.length === 0;
  const submitDisabled = Boolean(disabled)
    || (promptText.trim().length === 0 && attachments.length === 0 && contextItems.length === 0);

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
    if (trimmed === '/clear') {
      setPromptText('');
      setTriggerState(null);
      return;
    }
    if (trimmed === '/reset') {
      setPromptText('');
      setAttachments([]);
      clearContextItems();
      setTriggerState(null);
      return;
    }
    if (!trimmed && attachments.length === 0 && contextItems.length === 0) return;
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
    setHistoryIndex((prev) => ({
      ...prev,
      [shellMode ? 'shell' : 'normal']: -1,
    }));
    setDraft((prev) => ({
      ...prev,
      [shellMode ? 'shell' : 'normal']: '',
    }));
    setAttachments([]);
  };

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: PromptAttachment[] = [];
    for (const file of Array.from(files)) {
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
        void handleFiles(dropped);
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
    if (item.id === 'clear') {
      setPromptText('');
      setTriggerState(null);
      return;
    }
    if (item.id === 'reset') {
      setPromptText('');
      setAttachments([]);
      clearContextItems();
      setTriggerState(null);
      return;
    }
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

    if (shellMode && event.key === 'Escape') {
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
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
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
      if (event.key === 'Escape') {
        event.preventDefault();
        setTriggerState(null);
        return;
      }
    }

    if (event.key === 'Enter' && event.shiftKey) {
      addPart({ type: 'text', content: '\n' });
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
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
      setHistoryIndex((prev) => ({ ...prev, [key]: nextIndex }));
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
        setHistoryIndex((prev) => ({ ...prev, [key]: -1 }));
        setPromptText(draft[key]);
        focusEditorAt(draft[key].length);
        return;
      }
      setHistoryIndex((prev) => ({ ...prev, [key]: nextIndex }));
      const nextValue = list[nextIndex] ?? '';
      setPromptText(nextValue);
      focusEditorAt(nextValue.length);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className={`relative flex h-full flex-col gap-3 p-3 ${className ?? ''}`.trim()}>
      {trigger && (
        <div
          className="absolute inset-x-0 -top-3 -translate-y-full origin-bottom-left z-20 max-h-80 min-h-10
                 overflow-auto no-scrollbar rounded-md border border-border bg-background p-2 shadow-md"
          onMouseDown={(event) => event.preventDefault()}
        >
          {(() => {
            // Group by function (like OpenCode)
            const groupBy = (item: SuggestionItem): string => {
              if ('group' in item) {
                if (item.group === 'agent') return 'agent';
                if (item.group === 'recent') return 'recent';
                if (item.group === 'search') return 'search';
              }
              return 'default';
            };

            // Sort groups by rank (like OpenCode)
            const sortGroupsBy = (groupA: string, groupB: string): number => {
              const rank = (category: string) => {
                if (category === 'agent') return 0;
                if (category === 'recent') return 1;
                return 2;
              };
              return rank(groupA) - rank(groupB);
            };

            const groups: Record<string, SuggestionItem[]> = {};
            for (const item of suggestions) {
              const group = groupBy(item);
              if (!groups[group]) groups[group] = [];
              groups[group].push(item);
            }

            const groupOrder = Object.keys(groups).sort(sortGroupsBy);

            // Limit total suggestions to 20, max 10 per group (like OpenCode)
            let totalShown = 0;
            const MAX_SUGGESTIONS = 20;

            return (
              <>
                {groupOrder.map((group) => {
                  if (totalShown >= MAX_SUGGESTIONS) return null;
                  const groupSuggestions = groups[group];
                  const itemsToShow = groupSuggestions.slice(0, Math.min(MAX_SUGGESTIONS - totalShown, 10));
                  if (itemsToShow.length === 0) return null;

                  const groupLabel =
                    group === 'agent' ? 'Agents' :
                    group === 'recent' ? 'Recent Files' :
                    group === 'search' ? 'Workspace' :
                    '';

                  return (
                    <div key={group}>
                      {groupLabel && (
                        <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background">
                          {groupLabel}
                        </div>
                      )}
                      {itemsToShow.map((item, index) => {
                        const isAgent = 'agent' in item && !!item.agent;
                        const hasPath = 'path' in item && !!item.path;
                        const agent = isAgent ? item.agent : undefined;
                        const description = 'description' in item ? item.description : undefined;
                        const filePath: string = hasPath && 'path' in item ? (item.path as string) : '';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => (item.type === 'command' ? handleCommandSelect(item as SuggestionItem) : applySuggestion(item as SuggestionItem))}
                            className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/30 ${
                              totalShown + index === activeIndex ? 'bg-muted/30' : ''
                            }`}
                          >
                            {isAgent ? (
                              <>
                                <Brain className="text-info-active shrink-0 size-4" />
                                <span className="text-foreground whitespace-nowrap">
                                  @{agent}
                                </span>
                              </>
                            ) : hasPath ? (
                              <>
                                <FileIcon className="shrink-0 size-4" />
                                <div className="flex items-center min-w-0">
                                  <span className="text-muted-foreground whitespace-nowrap truncate min-w-0">
                                    {getDirectory(filePath)}
                                  </span>
                                  {!filePath.endsWith('/') && (
                                    <span className="text-foreground whitespace-nowrap">
                                      {getFilename(filePath)}
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">{item.label}</span>
                                {description && <span className="text-muted-foreground">{description}</span>}
                              </>
                            )}
                          </button>
                        );
                      })}
                      {totalShown += itemsToShow.length}
                    </div>
                  );
                })}
                {suggestions.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No results found</div>
                )}
              </>
            );
          })()}
        </div>
      )}
      <form
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
          <div className="flex flex-nowrap items-start gap-2 p-2 overflow-x-auto no-scrollbar">
            {contextItems.map((item) => {
              const selection = item.selection;
              const start = selection ? Math.min(selection.startLine, selection.endLine) : null;
              const end = selection ? Math.max(selection.startLine, selection.endLine) : null;
              const selectionLabel = selection
                ? start === end
                  ? `:${start}`
                  : `:${start}-${end}`
                : '';

              return (
                <div
                  key={item.id}
                  title={item.path}
                  className="group shrink-0 flex flex-col rounded-md border border-border bg-muted/20 pl-2 pr-1 py-1 max-w-[220px] h-12 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-1.5">
                    <FileIcon className="shrink-0 size-3.5 text-muted-foreground" />
                    <div className="flex items-center text-[11px] font-medium min-w-0">
                      <span className="text-foreground whitespace-nowrap truncate">
                        {getFilenameTruncated(item.path, 14)}
                      </span>
                      {selectionLabel && (
                        <span className="text-muted-foreground whitespace-nowrap shrink-0">{selectionLabel}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeContextItem(item.id)}
                      className="ml-auto h-5 w-5 rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
                      aria-label="Remove context"
                    >
                      <Icon name="close" size="small" />
                    </button>
                  </div>
                  {item.comment && (
                    <div className="ml-5 pr-1 text-[11px] text-foreground truncate">
                      {item.comment}
                    </div>
                  )}
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
        <div className={`relative max-h-[240px] overflow-y-auto ${editorWrapperClassName ?? ''}`.trim()}>
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
                void handleFiles(items);
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
        <div className="relative flex items-center justify-between px-3 py-2 pr-12">
          <div className="flex items-center gap-1.5">
            {shellMode ? (
              <div className="flex items-center gap-2 px-2 h-6 text-xs">
                <Icon name="console" size="small" className="text-foreground" />
                <span className="text-foreground">Shell mode</span>
                <span className="text-muted-foreground">Esc to exit</span>
              </div>
            ) : (
              <>
                {agents.length > 0 && (
                  <select
                    value={selectedAgent ?? ''}
                    onChange={(event) => setSelectedAgent(event.target.value || null)}
                    className="h-6 rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground hover:bg-muted/40 focus:border-border focus:outline-none focus:ring-1 focus:ring-[var(--md-accent)]"
                  >
                    <option value="">Default agent</option>
                    {agents.filter((agent) => !agent.hidden).map((agent) => (
                      <option key={agent.name} value={agent.name}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                )}
                {providers.length > 0 && (
                  <select
                    value={selectedProviderId}
                    onChange={(event) => {
                      const providerID = event.target.value;
                      const nextProvider = providers.find((item) => item.id === providerID);
                      const nextModels = nextProvider ? Object.keys(nextProvider.models ?? {}) : [];
                      const preferred = providerDefaults[providerID];
                      const modelID = preferred && nextModels.includes(preferred) ? preferred : nextModels[0] ?? '';
                      setSelectedModel(modelID ? { providerID, modelID } : null);
                    }}
                    className="h-6 rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground hover:bg-muted/40 focus:border-border focus:outline-none focus:ring-1 focus:ring-[var(--md-accent)]"
                  >
                    <option value="">Default provider</option>
                    {providers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                )}
                {modelOptions.length > 0 && (
                  <select
                    value={selectedModel?.modelID ?? ''}
                    onChange={(event) => {
                      const modelID = event.target.value;
                      if (!selectedProviderId) return;
                      setSelectedModel(modelID ? { providerID: selectedProviderId, modelID } : null);
                    }}
                    className="h-6 rounded-md border border-transparent bg-transparent px-2 text-xs text-muted-foreground hover:bg-muted/40 focus:border-border focus:outline-none focus:ring-1 focus:ring-[var(--md-accent)]"
                  >
                    {modelOptions.map((modelID) => {
                      const label = provider?.models?.[modelID]?.name ?? modelID;
                      return (
                        <option key={modelID} value={modelID}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                )}
              </>
            )}
          </div>
          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={SUPPORTED_TYPES.join(',')}
              multiple
              className="hidden"
              onChange={(event) => {
                void handleFiles(event.target.files);
                if (event.currentTarget) event.currentTarget.value = '';
              }}
            />
            {!shellMode && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="h-6 w-6 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/30 disabled:opacity-50"
                aria-label="Attach file"
              >
                <ImageIcon className="size-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={submitDisabled}
              className="h-6 w-6 rounded-md bg-[var(--md-accent)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <Icon name="arrow-up" size="small" className="text-white" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function createPill(part: InsertPart): HTMLSpanElement {
  const pill = document.createElement('span');
  pill.textContent = part.content;
  pill.setAttribute('data-type', part.type);
  if (part.type === 'file') pill.setAttribute('data-path', part.path);
  if (part.type === 'agent') pill.setAttribute('data-name', part.name);
  pill.setAttribute('contenteditable', 'false');
  pill.style.userSelect = 'text';
  pill.style.cursor = 'default';
  pill.className =
    'inline-flex items-center rounded bg-muted/50 px-1.5 py-0.5 text-xs text-foreground align-middle';
  return pill;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `att-${time}-${rand}`;
}
