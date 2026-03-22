export const ZERO_WIDTH_SPACE = '\u200B';

export type TextPart = {
  type: 'text';
  content: string;
  start: number;
  end: number;
};

export type FilePart = {
  type: 'file';
  content: string;
  path: string;
  selection?: { startLine: number; endLine: number };
  start: number;
  end: number;
};

export type AgentPart = {
  type: 'agent';
  content: string;
  name: string;
  start: number;
  end: number;
};

export type PromptPart = TextPart | FilePart | AgentPart;

export type InsertPart =
  | { type: 'text'; content: string }
  | { type: 'file'; content: string; path: string; selection?: { startLine: number; endLine: number } }
  | { type: 'agent'; content: string; name: string };

const DEFAULT_PROMPT: PromptPart[] = [{ type: 'text', content: '', start: 0, end: 0 }];

export const isPromptEqual = (left: PromptPart[], right: PromptPart[]): boolean => {
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

export const createTextFragment = (content: string): DocumentFragment => {
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

export const createPill = (part: { type: 'file' | 'agent'; content: string; path?: string; name?: string; selection?: { startLine: number; endLine: number } }): HTMLElement => {
  const pill = document.createElement('span');
  pill.textContent = part.content;
  pill.setAttribute('data-type', part.type);
  if (part.type === 'file' && part.path) pill.setAttribute('data-path', part.path);
  if (part.type === 'file' && part.selection) {
    pill.setAttribute('data-start-line', String(part.selection.startLine));
    pill.setAttribute('data-end-line', String(part.selection.endLine));
  }
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

export const getTextLength = (node: Node): number => {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200B/g, '').length;
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') return 1;
  let length = 0;
  for (const child of Array.from(node.childNodes)) {
    length += getTextLength(child);
  }
  return length;
};

export const getCursorPosition = (parent: HTMLElement): number => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!parent.contains(range.startContainer)) return 0;
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(parent);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return getTextLength(preCaretRange.cloneContents());
};

export const setCursorPosition = (parent: HTMLElement, position: number): void => {
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

export const setRangeEdge = (parent: HTMLElement, range: Range, edge: 'start' | 'end', offset: number): void => {
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

export const parseFromDOM = (editor: HTMLElement): PromptPart[] => {
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
    const startLine = file.dataset.startLine;
    const endLine = file.dataset.endLine;
    const selection = startLine && endLine
      ? { startLine: Number(startLine), endLine: Number(endLine) }
      : undefined;
    parts.push({ type: 'file', path, content, selection, start: position, end: position + content.length });
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

export const isNormalizedEditor = (editor: HTMLElement): boolean =>
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

export const createId = (): string => Math.random().toString(36).substring(2, 9);

export const readAsDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
