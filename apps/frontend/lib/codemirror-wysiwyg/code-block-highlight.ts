import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/**
 * Syntax highlighting for code in markdown documents.
 * Uses CodeMirror's default highlight style which provides
 * token classes like .tok-keyword, .tok-string, etc.
 * Colors are defined in markdown-editor.css.
 */
export const codeBlockHighlighter: Extension = [
  // Add default syntax highlighting - this adds classes to tokens
  // The actual colors are defined in markdown-editor.css via CSS variables
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
];
