
import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import morphdom from 'morphdom';

const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ['style'],
  FORBID_CONTENTS: ['style', 'script'],
};

if (typeof window !== 'undefined' && DOMPurify.isSupported) {
  DOMPurify.addHook('afterSanitizeAttributes', (node: Element) => {
    if (!(node instanceof HTMLAnchorElement)) return;
    if (node.target !== '_blank') return;

    const rel = node.getAttribute('rel') ?? '';
    const set = new Set(rel.split(/\s+/).filter(Boolean));
    set.add('noopener');
    set.add('noreferrer');
    node.setAttribute('rel', Array.from(set).join(' '));
  });
}

const MAX_CACHE_SIZE = 200;
const markdownCache = new Map<string, { hash: string; html: string }>();

function cacheTouch(key: string, value: { hash: string; html: string }) {
  markdownCache.delete(key);
  markdownCache.set(key, value);

  if (markdownCache.size <= MAX_CACHE_SIZE) return;

  const first = markdownCache.keys().next().value;
  if (!first) return;
  markdownCache.delete(first);
}

function checksum(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

function sanitize(html: string): string {
  if (!DOMPurify.isSupported) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

// Code block copy button

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-icon" style="display:none;"><path d="M20 6 9 17l-5-5"/></svg>`;

function createCopyButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'markdown-copy-button';
  button.setAttribute('aria-label', 'Copy code');
  button.setAttribute('data-slot', 'markdown-copy-button');
  button.innerHTML = COPY_ICON + CHECK_ICON;
  return button;
}

function setCopyState(button: HTMLButtonElement, copied: boolean) {
  const copyIcon = button.querySelector<SVGElement>('.copy-icon');
  const checkIcon = button.querySelector<SVGElement>('.check-icon');
  if (copied) {
    button.setAttribute('data-copied', 'true');
    button.setAttribute('aria-label', 'Copied!');
    if (copyIcon) copyIcon.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'inline-block';
  } else {
    button.removeAttribute('data-copied');
    button.setAttribute('aria-label', 'Copy code');
    if (copyIcon) copyIcon.style.display = '';
    if (checkIcon) checkIcon.style.display = 'none';
  }
}

function ensureCodeWrappers(root: HTMLDivElement) {
  const blocks = root.querySelectorAll('pre');
  for (const pre of blocks) {
    const parent = pre.parentElement;
    if (!parent) continue;
    if (parent.getAttribute('data-component') === 'markdown-code') {
      // Already wrapped
      if (!parent.querySelector('[data-slot="markdown-copy-button"]')) {
        parent.appendChild(createCopyButton());
      }
      continue;
    }
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-component', 'markdown-code');
    parent.replaceChild(wrapper, pre);
    pre.setAttribute('data-scrollable', '');
    wrapper.appendChild(pre);
    wrapper.appendChild(createCopyButton());
  }
}

// Clickable URLs in inline code

const URL_PATTERN = /^https?:\/\/[^\s<>()`"']+$/;

function codeUrl(text: string): string | undefined {
  const href = text.trim().replace(/[),.;!?]+$/, '');
  if (!URL_PATTERN.test(href)) return undefined;
  try {
    return new URL(href).toString();
  } catch {
    return undefined;
  }
}

function markCodeLinks(root: HTMLDivElement) {
  const codeNodes = root.querySelectorAll(':not(pre) > code');
  for (const code of codeNodes) {
    const href = codeUrl(code.textContent ?? '');
    const parentLink =
      code.parentElement instanceof HTMLAnchorElement && code.parentElement.classList.contains('external-link')
        ? code.parentElement
        : null;

    if (!href) {
      if (parentLink) parentLink.replaceWith(code);
      continue;
    }

    if (parentLink) {
      parentLink.href = href;
      continue;
    }

    const link = document.createElement('a');
    link.href = href;
    link.className = 'external-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    code.parentNode?.replaceChild(link, code);
    link.appendChild(code);
  }
}

function decorate(root: HTMLDivElement) {
  ensureCodeWrappers(root);
  markCodeLinks(root);
}

function setupCodeCopy(root: HTMLDivElement): () => void {
  const timeouts = new Map<HTMLButtonElement, ReturnType<typeof setTimeout>>();

  const handleClick = async (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest('[data-slot="markdown-copy-button"]');
    if (!(button instanceof HTMLButtonElement)) return;

    const code = button.closest('[data-component="markdown-code"]')?.querySelector('code');
    const content = code?.textContent ?? '';
    if (!content) return;

    const clipboard = navigator?.clipboard;
    if (!clipboard) return;

    await clipboard.writeText(content);
    setCopyState(button, true);

    const existing = timeouts.get(button);
    if (existing) clearTimeout(existing);
    timeouts.set(button, setTimeout(() => setCopyState(button, false), 2000));
  };

  root.addEventListener('click', handleClick);

  return () => {
    root.removeEventListener('click', handleClick);
    for (const timeout of timeouts.values()) clearTimeout(timeout);
  };
}

// Component

type MarkdownProps = {
  text: string;
  cacheKey?: string;
  className?: string;
};

export function Markdown({ text, cacheKey, className }: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const copyCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const run = async () => {
      const hash = checksum(text);
      const key = cacheKey ?? hash;

      let safe: string;

      if (key && hash) {
        const cached = markdownCache.get(key);
        if (cached && cached.hash === hash) {
          cacheTouch(key, cached);
          safe = cached.html;
        } else {
          const parsed = await marked.parse(text);
          safe = sanitize(parsed);
          cacheTouch(key, { hash, html: safe });
        }
      } else {
        const parsed = await marked.parse(text);
        safe = sanitize(parsed);
      }

      const temp = document.createElement('div');
      temp.innerHTML = safe;
      decorate(temp);

      morphdom(container, temp, {
        childrenOnly: true,
        onBeforeElUpdated(fromEl, toEl) {
          if (fromEl.isEqualNode(toEl)) return false;
          return true;
        },
      });

      decorate(container);

      if (!copyCleanupRef.current) {
        copyCleanupRef.current = setupCodeCopy(container);
      }
    };

    run();
  }, [text, cacheKey]);

  useEffect(() => {
    return () => {
      copyCleanupRef.current?.();
      copyCleanupRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      data-component="markdown"
    />
  );
}
