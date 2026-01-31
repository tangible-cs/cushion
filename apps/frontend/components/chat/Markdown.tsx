'use client';

import { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Copy, Check } from 'lucide-react';

// Configure DOMPurify for security
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true, mathMl: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ['style'],
  FORBID_CONTENTS: ['style', 'script'],
};

// Add security hook for anchor tags (noopener, noreferrer)
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

// Cache for rendered markdown to avoid re-parsing
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

// Simple checksum function for cache keys
function checksum(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

function sanitize(html: string): string {
  if (!DOMPurify.isSupported) return '';
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

type MarkdownProps = {
  text: string;
  cacheKey?: string;
  className?: string;
};

export function Markdown({ text, cacheKey, className }: MarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Parse and render markdown
  useEffect(() => {
    const parseMarkdown = async () => {
      const hash = checksum(text);
      const key = cacheKey ?? hash;

      // Check cache
      if (key && hash) {
        const cached = markdownCache.get(key);
        if (cached && cached.hash === hash) {
          cacheTouch(key, cached);
          setHtml(cached.html);
          return;
        }
      }

      // Parse markdown
      const parsed = await marked.parse(text);
      const safe = sanitize(parsed);

      if (key && hash) {
        cacheTouch(key, { hash, html: safe });
      }

      setHtml(safe);
    };

    parseMarkdown();
  }, [text, cacheKey]);

  // Setup code copy buttons after HTML is rendered
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !html) return;

    // Setup copy buttons for code blocks
    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
      const parent = pre.parentElement;
      if (!parent) return;

      // Skip if already wrapped
      if (parent.getAttribute('data-component') === 'markdown-code') return;

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-component', 'markdown-code');
      wrapper.style.position = 'relative';

      // Create unique ID for this code block
      const codeId = Math.random().toString(36).substring(7);
      const code = pre.querySelector('code');
      const codeContent = code?.textContent ?? '';

      // Create copy button
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'markdown-copy-button';
      button.setAttribute('aria-label', 'Copy code');
      button.setAttribute('title', 'Copy code');
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon">
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-icon" style="display: none;">
          <path d="M20 6 9 17l-5-5"/>
        </svg>
      `;

      button.addEventListener('click', async () => {
        const clipboard = navigator?.clipboard;
        if (!clipboard) return;

        await clipboard.writeText(codeContent);
        setCopiedCodeId(codeId);

        // Reset after 2 seconds
        setTimeout(() => {
          setCopiedCodeId((prev) => (prev === codeId ? null : prev));
        }, 2000);
      });

      // Update button state when copiedCodeId changes
      const updateButtonState = () => {
        if (copiedCodeId === codeId) {
          button.setAttribute('data-copied', 'true');
          button.setAttribute('aria-label', 'Copied!');
          button.setAttribute('title', 'Copied!');
          button.querySelector('.copy-icon')?.setAttribute('style', 'display: none');
          button.querySelector('.check-icon')?.setAttribute('style', 'display: inline-block');
        } else {
          button.removeAttribute('data-copied');
          button.setAttribute('aria-label', 'Copy code');
          button.setAttribute('title', 'Copy code');
          button.querySelector('.copy-icon')?.setAttribute('style', 'display: inline-block');
          button.querySelector('.check-icon')?.setAttribute('style', 'display: none');
        }
      };

      button.addEventListener('copied-state-changed', updateButtonState);

      parent.replaceChild(wrapper, pre);
      // Add data-scrollable to pre for proper scroll handling
      pre.setAttribute('data-scrollable', '');
      wrapper.appendChild(pre);
      wrapper.appendChild(button);
    });

    return () => {
      // Cleanup happens automatically when component unmounts
    };
  }, [html, copiedCodeId]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-component="markdown"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}