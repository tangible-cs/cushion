/**
 * Wiki-Link Parsing Utilities
 * 
 * Parses [[wiki-link]] syntax similar to Obsidian/Tangent.
 * Supports:
 *   - [[note]]           - Basic link
 *   - [[folder/note]]    - Link with path
 *   - [[note#header]]    - Link with header anchor
 *   - [[note|display]]   - Link with custom display text
 *   - [[note#header|display]] - Full syntax
 */

import type { WikiLinkInfo } from '@cushion/types';

const TABLE_CELL_SEPARATOR = '\\|';

function normalizeHrefForEscapedSeparator(href: string, displayText?: string): string {
  if (!displayText) {
    return href;
  }

  if (href.endsWith('\\')) {
    return href.slice(0, -1);
  }

  return href;
}

function isEscapedAt(text: string, index: number): boolean {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && text[cursor] === '\\') {
    slashCount++;
    cursor--;
  }

  return slashCount % 2 === 1;
}

/**
 * Escape unescaped pipes for text that will be written in a markdown table cell.
 */
export function escapeForTableCell(text: string): string {
  if (!text.includes('|')) {
    return text;
  }

  let escaped = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '|' && !isEscapedAt(text, i)) {
      escaped += TABLE_CELL_SEPARATOR;
      continue;
    }

    escaped += char;
  }

  return escaped;
}

/**
 * Regex for matching wiki-links.
 * Adapted from Tangent's wikiLinkMatcher.
 * 
 * Pattern breakdown:
 *   \[\[              - Opening brackets
 *   ([^\[\]|#\n]+)    - Group 1: href (path/filename, no brackets, pipes, hashes, or newlines)
 *   (#[^\[\]|#\n]*)?  - Group 2: optional contentId (header anchor)
 *   (\|[^\[\]\n]*)?   - Group 3: optional display text
 *   \]\]              - Closing brackets
 */
export const wikiLinkRegex = /\[\[([^\[\]|#\n]+)(#[^\[\]|#\n]*)?(\|[^\[\]\n]*)?\]\]/g;

/**
 * Regex for matching a single wiki-link (non-global, for testing a specific position)
 */
export const wikiLinkRegexSingle = /\[\[([^\[\]|#\n]+)(#[^\[\]|#\n]*)?(\|[^\[\]\n]*)?\]\]/;

/**
 * Parse a wiki-link string into its components.
 * 
 * @param text - The wiki-link text (with or without brackets)
 * @returns Parsed components or null if invalid
 */
export function parseWikiLink(text: string): Omit<WikiLinkInfo, 'start' | 'end'> | null {
  // Remove brackets if present
  const cleanText = text.startsWith('[[') ? text : `[[${text}]]`;
  const match = cleanText.match(wikiLinkRegexSingle);
  
  if (!match) return null;
  
  const rawHref = match[1].trim();
  const contentId = match[2] ? match[2].slice(1).trim() : undefined; // Remove leading #
  const displayText = match[3] ? match[3].slice(1).trim() : undefined; // Remove leading |
  const href = normalizeHrefForEscapedSeparator(rawHref, displayText);
  
  return {
    raw: cleanText,
    href,
    contentId: contentId || undefined,
    displayText: displayText || undefined,
  };
}

/**
 * Find all wiki-links in a document.
 * 
 * @param text - Document text to search
 * @returns Array of WikiLinkInfo objects
 */
export function findAllWikiLinks(text: string): WikiLinkInfo[] {
  const links: WikiLinkInfo[] = [];
  const regex = new RegExp(wikiLinkRegex.source, 'g');
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawHref = match[1].trim();
    const contentId = match[2] ? match[2].slice(1).trim() : undefined;
    const displayText = match[3] ? match[3].slice(1).trim() : undefined;
    const href = normalizeHrefForEscapedSeparator(rawHref, displayText);
    
    links.push({
      raw: match[0],
      href,
      contentId: contentId || undefined,
      displayText: displayText || undefined,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  
  return links;
}

/**
 * Get the display text for a wiki-link.
 * Returns custom display text if provided, otherwise the href (filename portion).
 * 
 * @param link - Parsed wiki-link info
 * @returns Text to display for the link
 */
export function getWikiLinkDisplayText(link: Pick<WikiLinkInfo, 'href' | 'displayText' | 'contentId'>): string {
  if (link.displayText) {
    return link.displayText;
  }
  
  // Extract filename from path (last segment)
  const filename = link.href.split('/').pop() || link.href;
  
  // Append content anchor if present (like Tangent shows "→section")
  if (link.contentId) {
    return `${filename} → ${link.contentId}`;
  }
  
  return filename;
}

/**
 * Check if a position in the document is inside a wiki-link.
 * 
 * @param text - Document text
 * @param position - Character position to check
 * @returns WikiLinkInfo if position is inside a link, null otherwise
 */
export function getWikiLinkAtPosition(text: string, position: number): WikiLinkInfo | null {
  const links = findAllWikiLinks(text);
  
  for (const link of links) {
    if (position >= link.start && position <= link.end) {
      return link;
    }
  }
  
  return null;
}

/**
 * Create a wiki-link string from components.
 * 
 * @param href - Target file path/name
 * @param options - Optional contentId and displayText
 * @returns Formatted wiki-link string
 */
export function createWikiLink(
  href: string,
  options?: { contentId?: string; displayText?: string; inTableCell?: boolean }
): string {
  let link = `[[${href}`;
  
  if (options?.contentId) {
    link += `#${options.contentId}`;
  }
  
  if (options?.displayText) {
    const separator = options.inTableCell ? TABLE_CELL_SEPARATOR : '|';
    const displayText = options.inTableCell
      ? escapeForTableCell(options.displayText)
      : options.displayText;
    link += `${separator}${displayText}`;
  }
  
  link += ']]';
  return link;
}

/**
 * Create a wiki-embed string from components.
 */
export function createWikiEmbed(
  href: string,
  options?: { contentId?: string; displayText?: string; inTableCell?: boolean }
): string {
  return `!${createWikiLink(href, options)}`;
}
