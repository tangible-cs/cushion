/**
 * Frontmatter parsing and serialization utilities
 * 
 * Inspired by Tangent's NoteParser frontmatter handling.
 * Parses YAML frontmatter from markdown files.
 */

import YAML from 'yaml';

// =============================================================================
// Types
// =============================================================================

export interface Frontmatter {
  /** Character position where frontmatter starts (0) */
  start: number;
  /** Character position where frontmatter ends (after closing ---) */
  end: number;
  /** Raw YAML string (without delimiters) */
  raw: string;
  /** Parsed data object */
  data: Record<string, unknown>;
}

export interface ParseResult {
  /** Extracted frontmatter, or null if none found */
  frontmatter: Frontmatter | null;
  /** Content after frontmatter (or full content if no frontmatter) */
  content: string;
  /** Any parsing errors */
  errors: string[];
}

// =============================================================================
// Parsing
// =============================================================================

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse frontmatter from a markdown/text file content.
 * 
 * Like Tangent, we:
 * - Only look for frontmatter at the very start of the document
 * - Use lenient YAML parsing (strict: false)
 * - Convert tabs to spaces before parsing (YAML doesn't like tabs)
 */
export function parseFrontmatter(content: string): ParseResult {
  const errors: string[] = [];
  
  // Frontmatter must start at the beginning of the document
  if (!content.startsWith('---')) {
    return {
      frontmatter: null,
      content,
      errors,
    };
  }

  const match = content.match(FRONTMATTER_REGEX);
  
  if (!match) {
    // Has opening --- but no closing ---
    // Check if it's an unclosed frontmatter block
    const lines = content.split('\n');
    if (lines[0] === '---' || lines[0] === '---\r') {
      errors.push('Unclosed frontmatter block');
    }
    return {
      frontmatter: null,
      content,
      errors,
    };
  }

  const raw = match[1];
  const fullMatch = match[0];
  const end = fullMatch.length;

  // Convert tabs to spaces (YAML doesn't like tabs for indentation)
  const translated = raw.replace(/\t+/g, '    ');

  let data: Record<string, unknown> = {};
  
  try {
    const document = YAML.parseDocument(translated, {
      strict: false,
    });

    // Collect YAML errors
    for (const error of document.errors) {
      errors.push(`YAML error: ${error.message}`);
    }
    
    // Collect YAML warnings
    for (const warning of document.warnings) {
      errors.push(`YAML warning: ${warning.message}`);
    }

    const parsed = document.toJS();
    
    // Handle empty frontmatter (--- followed by ---)
    if (parsed === null || parsed === undefined) {
      data = {};
    } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else {
      // Top-level value is not an object (e.g., just a string or array)
      errors.push('Frontmatter must be a YAML object');
      data = {};
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(`Failed to parse YAML: ${message}`);
  }

  const frontmatter: Frontmatter = {
    start: 0,
    end,
    raw,
    data,
  };

  // Content is everything after the frontmatter
  const contentAfter = content.slice(end);

  return {
    frontmatter,
    content: contentAfter,
    errors,
  };
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize a frontmatter data object back to YAML string with delimiters.
 */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  if (Object.keys(data).length === 0) {
    return '---\n---\n';
  }
  
  const yaml = YAML.stringify(data, {
    lineWidth: 0, // Don't wrap lines
    singleQuote: true,
  }).trimEnd();
  
  return `---\n${yaml}\n---\n`;
}

/**
 * Merge frontmatter back into content.
 * If frontmatter is null or empty, just return content as-is.
 */
export function mergeWithFrontmatter(
  frontmatter: Record<string, unknown> | null,
  content: string
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) {
    return content;
  }
  
  return serializeFrontmatter(frontmatter) + content;
}

/**
 * Update frontmatter in existing content.
 * Replaces existing frontmatter or adds new one at the start.
 */
export function updateFrontmatter(
  content: string,
  newData: Record<string, unknown>
): string {
  const { content: bodyContent } = parseFrontmatter(content);
  return mergeWithFrontmatter(newData, bodyContent);
}

// =============================================================================
// Utility Functions (inspired by Tangent's indexTypes.ts)
// =============================================================================

/**
 * Extract a specific field from frontmatter data.
 */
export function getFrontmatterField<T>(
  frontmatter: Frontmatter | null,
  field: string
): T | undefined {
  if (!frontmatter?.data) return undefined;
  return frontmatter.data[field] as T | undefined;
}

/**
 * Extract title from frontmatter, with fallback.
 */
export function getFrontmatterTitle(frontmatter: Frontmatter | null): string | undefined {
  return getFrontmatterField<string>(frontmatter, 'title');
}

/**
 * Extract tags from frontmatter.
 * Supports both string (single tag) and array formats.
 */
export function getFrontmatterTags(frontmatter: Frontmatter | null): string[] {
  const tags = getFrontmatterField<string | string[]>(frontmatter, 'tags');
  
  if (!tags) return [];
  if (typeof tags === 'string') return [tags];
  if (Array.isArray(tags)) return tags.filter((t): t is string => typeof t === 'string');
  
  return [];
}

/**
 * Extract aliases from frontmatter (like Tangent does for note linking).
 */
export function getFrontmatterAliases(frontmatter: Frontmatter | null): string[] {
  const aliases = getFrontmatterField<string | string[]>(frontmatter, 'aliases');
  
  if (!aliases) return [];
  if (typeof aliases === 'string') return [aliases];
  if (Array.isArray(aliases)) return aliases.filter((a): a is string => typeof a === 'string');
  
  return [];
}

/**
 * Check if content has frontmatter (quick check without full parsing).
 */
export function hasFrontmatter(content: string): boolean {
  return content.startsWith('---');
}
