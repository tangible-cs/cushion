/**
 * Wiki-Link and Code Language Autocomplete
 *
 * Provides autocomplete suggestions when typing [[ for wiki-links
 * and ``` for code block languages.
 */

import {
  autocompletion,
  CompletionContext,
  CompletionResult,
  Completion,
  startCompletion,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { fileTreeField } from './wiki-link-plugin';
import { searchFiles, flattenFileTree } from '../wiki-link-resolver';
import type { FileTreeNode } from '@cushion/types';

/**
 * Supported languages for code block autocomplete.
 */
const CODE_LANGUAGES = [
  'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
  'python', 'py',
  'html', 'htm',
  'css',
  'json',
  'bash', 'sh', 'shell',
  'sql',
  'markdown', 'md',
  'yaml', 'yml',
  'xml',
  'text',
  'rust', 'rs',
  'go',
  'java',
  'c', 'cpp', 'c++',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'dart',
  'scala',
];

/**
 * Get the filename without extension for display.
 */
function getDisplayName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/**
 * Get the directory part of a path (everything before the filename).
 */
function getDirectory(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  return lastSlash > 0 ? filePath.slice(0, lastSlash + 1) : '';
}

/**
 * Get the href value for a wiki-link (filename without .md extension).
 */
function getWikiLinkHref(filePath: string): string {
  // Remove .md extension if present, keep other extensions
  if (filePath.toLowerCase().endsWith('.md')) {
    return filePath.slice(0, -3);
  }
  return filePath;
}

/**
 * Check if we're inside a wiki-link and get the search text.
 * Returns null if not in a wiki-link context.
 */
function getWikiLinkContext(context: CompletionContext): {
  from: number;
  to: number;
  query: string;
} | null {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const textBefore = line.text.slice(0, pos - line.from);
  const textAfter = line.text.slice(pos - line.from);

  // Look for [[ that isn't closed yet
  const openBracketIndex = textBefore.lastIndexOf('[[');
  if (openBracketIndex === -1) return null;

  // Check if there's a ]] between [[ and cursor
  const afterBrackets = textBefore.slice(openBracketIndex + 2);
  if (afterBrackets.includes(']]')) return null;

  // Check for | (display text) or # (header) - stop suggestions after these
  if (afterBrackets.includes('|') || afterBrackets.includes('#')) return null;

  // Check if there are closing brackets after cursor
  let closingBracketsEnd = 0;
  if (textAfter.startsWith(']]')) {
    closingBracketsEnd = 2;
  } else if (textAfter.startsWith(']')) {
    closingBracketsEnd = 1;
  }

  const query = afterBrackets;
  const from = line.from + openBracketIndex + 2;
  const to = pos + closingBracketsEnd;

  return { from, to, query };
}

/**
 * Wiki-link completion source.
 * Triggers when typing inside [[ ]].
 */
function wikiLinkCompletions(context: CompletionContext): CompletionResult | null {
  const wikiContext = getWikiLinkContext(context);
  if (!wikiContext) return null;

  const { from, to, query } = wikiContext;
  const fileTree = context.state.field(fileTreeField, false) || [];

  // Get file suggestions
  let files: string[];
  if (query.length === 0) {
    files = flattenFileTree(fileTree).slice(0, 20);
  } else {
    files = searchFiles(query, fileTree, 15);
  }

  // Build completion options
  const options: Completion[] = files.map(filePath => {
    const displayName = getDisplayName(filePath);
    const directory = getDirectory(filePath);
    const href = getWikiLinkHref(filePath);
    const isMarkdown = filePath.toLowerCase().endsWith('.md');

    return {
      label: displayName,
      detail: directory || undefined,
      apply: (view: EditorView, completion: Completion, fromPos: number, toPos: number) => {
        const doc = view.state.doc;
        const line = doc.lineAt(toPos);
        const textAfter = line.text.slice(toPos - line.from);

        let endPos = toPos;
        if (textAfter.startsWith(']]')) {
          endPos = toPos + 2;
        } else if (textAfter.startsWith(']')) {
          endPos = toPos + 1;
        }

        const insert = `${href}]]`;
        view.dispatch({
          changes: { from: fromPos, to: endPos, insert },
          selection: { anchor: fromPos + insert.length },
        });
      },
      type: isMarkdown ? 'text' : 'file',
    };
  });

  // Add "Create new note" option
  if (query.length > 0 && !files.some(f => getDisplayName(f).toLowerCase() === query.toLowerCase())) {
    options.push({
      label: query,
      detail: '+ Create new note',
      apply: (view: EditorView, completion: Completion, fromPos: number, toPos: number) => {
        const doc = view.state.doc;
        const line = doc.lineAt(toPos);
        const textAfter = line.text.slice(toPos - line.from);

        let endPos = toPos;
        if (textAfter.startsWith(']]')) {
          endPos = toPos + 2;
        } else if (textAfter.startsWith(']')) {
          endPos = toPos + 1;
        }

        const insert = `${query}]]`;
        view.dispatch({
          changes: { from: fromPos, to: endPos, insert },
          selection: { anchor: fromPos + insert.length },
        });
      },
      type: 'keyword',
      boost: -1,
    });
  }

  if (options.length === 0) return null;

  return {
    from,
    options,
    validFor: /^[^\[\]|#\n]*$/,
  };
}

/**
 * Code block language completion source.
 * Triggers when typing ```.
 */
function codeLangCompletion(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const textBefore = line.text.slice(0, ctx.pos - line.from);

  // Only match ``` at the start of a line (with optional leading whitespace)
  const fenceMatch = textBefore.match(/^(\s*)```(\w*)$/);
  if (!fenceMatch) return null;

  const query = fenceMatch[2]; // text typed after ```
  const from = line.from + fenceMatch[1].length + 3; // position right after ```

  const filtered = query.length > 0
    ? CODE_LANGUAGES.filter(lang => lang.startsWith(query.toLowerCase()))
    : CODE_LANGUAGES;

  if (filtered.length === 0) return null;

  return {
    from,
    options: filtered.map((lang) => ({
      label: lang,
      type: 'keyword' as const,
      boost: lang === 'javascript' || lang === 'python' || lang === 'typescript' ? 1 : 0,
      apply: (view: EditorView, _completion: Completion, fromPos: number, toPos: number) => {
        // Insert language + newline + cursor position + newline + closing fence
        const insert = `${lang}\n\n\`\`\``;
        const cursorPos = fromPos + lang.length + 1; // right after the first newline
        view.dispatch({
          changes: { from: fromPos, to: toPos, insert },
          selection: { anchor: cursorPos },
        });
      },
    })),
    validFor: /^\w*$/,
  };
}

/**
 * Combined completion function that handles both wiki-links and code languages.
 */
function combinedCompletions(context: CompletionContext): CompletionResult | null {
  // Try wiki-link completion first
  const wikiResult = wikiLinkCompletions(context);
  if (wikiResult) return wikiResult;

  // Try code language completion
  return codeLangCompletion(context);
}

/**
 * Input handler that triggers autocomplete when [[ is typed.
 */
const wikiLinkTrigger = EditorView.inputHandler.of((view, from, to, text) => {
  if (text === '[') {
    const before = view.state.doc.sliceString(Math.max(0, from - 1), from);
    if (before === '[') {
      setTimeout(() => {
        startCompletion(view);
      }, 0);
    }
  }
  return false;
});

/**
 * Input handler that triggers autocomplete when the third ` is typed at the start of a line.
 */
const codeFenceTrigger = EditorView.inputHandler.of((view, from, to, text) => {
  if (text === '`') {
    const before = view.state.doc.sliceString(Math.max(0, from - 2), from);
    if (before === '``') {
      const line = view.state.doc.lineAt(from);
      const textBeforeCursor = view.state.doc.sliceString(line.from, from);
      if (/^\s*``$/.test(textBeforeCursor)) {
        setTimeout(() => {
          startCompletion(view);
        }, 0);
      }
    }
  }
  return false;
});

/**
 * Returns the combined autocomplete extension for both wiki-links and code languages.
 */
export function combinedAutocomplete(): Extension {
  return [
    autocompletion({
      override: [combinedCompletions],
      activateOnTyping: true,
      defaultKeymap: true,
      icons: true,
      optionClass: (completion) => {
        if (completion.type === 'keyword') return 'cm-wiki-link-create';
        return 'cm-wiki-link-option';
      },
    }),
    wikiLinkTrigger,
    codeFenceTrigger,
  ];
}
