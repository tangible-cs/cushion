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
import { EditorState, Extension } from '@codemirror/state';
import { fileTreeField } from './wiki-link-plugin';
import { searchFiles, flattenFileTree } from '../wiki-link-resolver';
import { getBaseName, getDirectory } from '../path-utils';
import { createWikiLink } from '../wiki-link';
import { isCursorInTableCell } from './table/table-context';

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
 * Get the href value for a wiki-link (filename without .md extension).
 */
function getWikiLinkHref(filePath: string): string {
  // Remove .md extension if present, keep other extensions
  if (filePath.toLowerCase().endsWith('.md')) {
    return filePath.slice(0, -3);
  }
  return filePath;
}

export function buildWikiLinkCompletionInsert(
  href: string,
  options?: { displayText?: string; inTableCell?: boolean }
): string {
  return createWikiLink(href, options).slice(2);
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
    const displayName = getBaseName(filePath);
    const directory = getDirectory(filePath);
    const href = getWikiLinkHref(filePath);
    const isMarkdown = filePath.toLowerCase().endsWith('.md');

    return {
      label: displayName,
      detail: directory ? `${directory}/` : undefined,
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

        const inTableCell = isCursorInTableCell(view.state, fromPos);
        const insert = buildWikiLinkCompletionInsert(href, { inTableCell });
        view.dispatch({
          changes: { from: fromPos, to: endPos, insert },
          selection: { anchor: fromPos + insert.length },
        });
      },
      type: isMarkdown ? 'text' : 'file',
    };
  });

  // Add "Create new note" option
  if (query.length > 0 && !files.some(f => getBaseName(f).toLowerCase() === query.toLowerCase())) {
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

        const inTableCell = isCursorInTableCell(view.state, fromPos);
        const insert = buildWikiLinkCompletionInsert(query, { inTableCell });
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
 * Check if there's an auto-inserted closing fence below the given line.
 * Looks for a pattern: opening ``` line → empty line → closing ``` line.
 */
function hasAutoClosingFence(state: EditorState, openingLineNumber: number): boolean {
  const totalLines = state.doc.lines;
  // Expect: openingLine, emptyLine, closingFenceLine
  if (openingLineNumber + 2 > totalLines) return false;
  const emptyLine = state.doc.line(openingLineNumber + 1);
  const closingLine = state.doc.line(openingLineNumber + 2);
  return emptyLine.text.trim() === '' && /^\s*```\s*$/.test(closingLine.text);
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
        const line = view.state.doc.lineAt(fromPos);
        // Check if closing fence already exists (auto-inserted by codeFenceTrigger)
        const hasClosingFence = hasAutoClosingFence(view.state, line.number);

        if (hasClosingFence) {
          // Just insert language name and move cursor to the empty line between fences
          view.dispatch({
            changes: { from: fromPos, to: toPos, insert: lang },
            selection: { anchor: fromPos + lang.length + 1 }, // after the newline
          });
        } else {
          // Fallback: insert language + newline + cursor position + newline + closing fence
          const insert = `${lang}\n\n\`\`\``;
          const cursorPos = fromPos + lang.length + 1;
          view.dispatch({
            changes: { from: fromPos, to: toPos, insert },
            selection: { anchor: cursorPos },
          });
        }
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
 * Input handler that auto-inserts closing ``` when the third ` is typed at
 * the start of a line, then triggers language autocomplete.
 *
 * Tangent-inspired: typing ``` immediately creates a complete fenced code
 * block so Lezer parses it as FencedCode and decorations apply right away.
 * The cursor stays after the opening ``` so the user can type a language name.
 */
const codeFenceTrigger = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '`') return false;

  const before = view.state.doc.sliceString(Math.max(0, from - 2), from);
  if (before !== '``') return false;

  const line = view.state.doc.lineAt(from);
  const textBeforeCursor = view.state.doc.sliceString(line.from, from);
  if (!/^\s*``$/.test(textBeforeCursor)) return false;

  // Let the ` be inserted first, then auto-insert closing fence
  setTimeout(() => {
    const pos = view.state.selection.main.head;
    const currentLine = view.state.doc.lineAt(pos);
    const currentText = currentLine.text.trim();

    // Only proceed if we're still on a bare ``` line (no language yet)
    if (!/^```\w*$/.test(currentText)) return;
    // Don't insert if a closing fence already exists right after
    if (currentLine.number < view.state.doc.lines) {
      const nextLine = view.state.doc.line(currentLine.number + 1);
      if (/^\s*```\s*$/.test(nextLine.text)) {
        // Closing fence already present, just trigger autocomplete
        startCompletion(view);
        return;
      }
    }

    // Insert newline + closing fence after current line
    const insertPos = currentLine.to;
    view.dispatch({
      changes: { from: insertPos, insert: '\n\n```' },
      // Keep cursor right where it is (after opening ```)
      selection: { anchor: pos },
    });

    // Trigger language autocomplete
    startCompletion(view);
  }, 0);

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
      icons: false,
      optionClass: (completion) => {
        if (completion.type === 'keyword') return 'cm-wiki-link-create';
        return 'cm-wiki-link-option';
      },
    }),
    wikiLinkTrigger,
    codeFenceTrigger,
  ];
}
