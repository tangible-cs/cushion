import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

export const codeBlockHighlighter: Extension = [
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
];
