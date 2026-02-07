import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { hideMarkupPlugin, linkClickHandler } from './hide-markup';
import { focusModeExtension, toggleFocusMode, setFocusMode, isFocusModeEnabled } from './focus-mode';
import { embedResolverField, setEmbedResolver, type EmbedResolver, type EmbedResolverResult } from './embed-resolver';
import {
  wikiLinkExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';
import { combinedAutocomplete } from './combined-autocomplete';
import { codeBlockHighlighter } from './code-block-highlight';
import { slashCommandExtension } from './slash-command';
import { listKeymap } from './list-commands';
import type { FileTreeNode } from '@cushion/types';

// Re-export focus mode utilities
export { toggleFocusMode, setFocusMode, isFocusModeEnabled } from './focus-mode';

// Re-export wiki-link utilities
export {
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';

export { setEmbedResolver, type EmbedResolver, type EmbedResolverResult } from './embed-resolver';

/**
 * Prose-optimized theme for markdown editing.
 * Uses CSS custom properties for theming consistency.
 * Applies a Tangent-inspired look with hidden syntax and proper typography.
 */
const markdownProseTheme = EditorView.theme({
  // Editor container - transparent to inherit parent background
  '&': {
    fontSize: 'var(--md-font-size, 16px)',
    backgroundColor: 'transparent',
    color: 'var(--md-text, #e0e0e0)',
  },
  // Scroller - handles overflow and contains the content
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--md-font-family, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    backgroundColor: 'transparent',
  },
  // Content area — left-aligned, comfortable reading width
  '.cm-content': {
    maxWidth: 'var(--md-content-max-width, 800px)',
    padding: 'var(--md-content-padding, 1em 2em)',
    paddingTop: '0',  /* No top padding - header handles spacing */
    paddingBottom: '40vh !important',  /* Extra space at bottom so user can scroll past content */
    caretColor: 'var(--md-text, #e0e0e0)',
    lineHeight: 'var(--md-baseline, 1.6)',
  },
  // Lines - ensure text wraps properly
  '.cm-line': {
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  // Hide line numbers for markdown
  '.cm-gutters': {
    display: 'none',
  },
  // Soften the active line highlight
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.02) !important',
  },
  // Cursor line in gutter (hidden since gutters are hidden, but just in case)
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent !important',
  },
  // Selection color
  '&.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--md-selection-bg, rgba(100, 153, 255, 0.25)) !important',
  },
});

/**
 * Widget-specific theme overrides.
 * These complement the CSS file for widget styling.
 */
const wysiwygWidgetTheme = EditorView.baseTheme({
  // Images
  '.cm-image-widget': {
    display: 'block',
    margin: '16px 0',
  },
  '.cm-image-widget img': {
    maxWidth: '100%',
    maxHeight: '500px',
    borderRadius: 'var(--md-border-radius, 6px)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  },
  '.cm-image-widget img:hover': {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
  },
  
  // Checkboxes - SVG styled
  '.cm-checkbox-widget': {
    width: '16px',
    height: '16px',
    margin: '0 8px 0 0',
    verticalAlign: 'middle',
    cursor: 'pointer',
    accentColor: 'var(--md-accent, #6fb3d2)',
    borderRadius: '3px',
  },
  
  // List bullets — base styles; depth-specific minWidth below
  '.cm-list-bullet': {
    color: 'var(--md-accent, #6fb3d2)',
    userSelect: 'none',
    fontWeight: '600',
    marginRight: '4px',
    display: 'inline-block',
    minWidth: '1.25em',
    textAlign: 'left',
  },
  '.cm-list-marker-hidden': {
    position: 'relative',
    display: 'inline-block',
    minWidth: '1.25em',
    textAlign: 'left',
    marginRight: '4px',
    color: 'transparent',
    userSelect: 'none',
  },
  '.cm-list-marker-hidden *': {
    color: 'transparent !important',
    fontSize: '0 !important',
    lineHeight: '0 !important',
  },
  '.cm-list-marker-hidden::after': {
    content: 'attr(data-list-marker)',
    position: 'absolute',
    left: 0,
    top: 0,
    color: 'var(--md-accent, #6fb3d2)',
    fontWeight: '600',
    fontSize: 'var(--md-font-size, 16px)',
    lineHeight: 'var(--md-baseline, 1.6)',
  },
  '.cm-list-marker': {
    display: 'inline-block',
    minWidth: '1.25em',
    textAlign: 'left',
    marginRight: '4px',
  },
  // Depth-specific marker widths so items at the same depth align
  '.cm-list-bullet.cm-list-depth-0': { minWidth: '1.25em' },  // numbers: 1–999
  '.cm-list-bullet.cm-list-depth-1': { minWidth: '1.25em' },  // alpha: a–zz
  '.cm-list-bullet.cm-list-depth-2': { minWidth: '2.25em' },  // roman: i–xxviii+
  '.cm-list-marker.cm-list-depth-0': { minWidth: '1.25em' },  // numbers: 1–999
  '.cm-list-marker.cm-list-depth-1': { minWidth: '1.25em' },  // alpha: a–zz
  '.cm-list-marker.cm-list-depth-2': { minWidth: '2.25em' },  // roman: i–xxviii+
  '.cm-list-marker-hidden.cm-list-depth-0': { minWidth: '1.25em' },
  '.cm-list-marker-hidden.cm-list-depth-1': { minWidth: '1.25em' },
  '.cm-list-marker-hidden.cm-list-depth-2': { minWidth: '2.25em' },
  
  // Horizontal rules
  '.cm-hr-widget': {
    display: 'block',
    border: 'none',
    borderTop: '1px solid var(--md-hr-color, #4a4a4a)',
    margin: '24px 0',
    height: '0',
  },
  
  // Links
  '.cm-link-text': {
    color: 'var(--md-link-color, #6fb3d2)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'color 0.15s ease',
    borderBottom: '1px solid transparent',
  },
  '.cm-link-text:hover': {
    color: 'var(--md-link-hover, #8ec8e3)',
    borderBottomColor: 'var(--md-link-hover, #8ec8e3)',
  },
  
  // Inline code
  '.cm-inline-code': {
    fontFamily: 'var(--md-code-font-family, "Fira Code", Consolas, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'var(--md-code-bg, #2a2a2a)',
    color: 'var(--md-code-text, #e6db74)',
    padding: '2px 6px',
    borderRadius: 'var(--md-border-radius-sm, 3px)',
    border: '1px solid var(--md-code-border, #3a3a3a)',
  },
  
  // Bold text
  '.cm-strong-text': {
    fontWeight: '600',
  },
  
  // Italic text
  '.cm-emphasis-text': {
    fontStyle: 'italic',
  },
  
  // Strikethrough
  '.cm-strikethrough-text': {
    textDecoration: 'line-through',
    color: 'var(--md-text-muted, #a0a0a0)',
  },
  
  // Headings - line decorations
  '.cm-heading-1': {
    fontSize: '2em',
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '-0.02em',
  },
  '.cm-heading-2': {
    fontSize: '1.5em',
    fontWeight: '600',
    lineHeight: '1.35',
    letterSpacing: '-0.01em',
  },
  '.cm-heading-3': {
    fontSize: '1.25em',
    fontWeight: '600',
    lineHeight: '1.4',
  },
  '.cm-heading-4': {
    fontSize: '1.1em',
    fontWeight: '600',
  },
  '.cm-heading-5': {
    fontSize: '1em',
    fontWeight: '600',
    color: 'var(--md-text-muted, #a0a0a0)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  '.cm-heading-6': {
    fontSize: '0.9em',
    fontWeight: '500',
    fontStyle: 'italic',
    color: 'var(--md-text-muted, #a0a0a0)',
  },
  
  // Blockquotes
  '.cm-blockquote': {
    borderLeft: '3px solid var(--md-blockquote-border, #4a4a4a)',
    paddingLeft: '16px',
    marginLeft: '8px',
    color: 'var(--md-blockquote-text, #b0b0b0)',
    fontStyle: 'italic',
  },
  
  // Code blocks
  '.cm-code-block': {
    fontFamily: 'var(--md-code-font-family, "Fira Code", Consolas, monospace)',
    fontSize: '0.9em',
    backgroundColor: 'var(--md-code-bg, #2a2a2a)',
    borderLeft: '3px solid var(--md-accent, #6fb3d2)',
    padding: '4px 12px',
  },
  
  // Tables — rendered widget
  '.cm-table-widget': {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '4px 0',
    fontSize: '0.95em',
  },
  '.cm-table-widget th, .cm-table-widget td': {
    padding: '6px 12px',
    borderBottom: '1px solid var(--md-border, #3a3a3a)',
  },
  '.cm-table-widget th': {
    fontWeight: '600',
    borderBottom: '2px solid var(--md-accent, #6fb3d2)',
  },
  '.cm-table-widget tbody tr:last-child td': {
    borderBottom: 'none',
  },
  // Tables — raw syntax (cursor inside)
  '.cm-table-row': {
    backgroundColor: 'var(--md-code-bg, #2a2a2a)',
    padding: '2px 12px',
    fontFamily: 'var(--md-code-font-family, "Fira Code", Consolas, monospace)',
    fontSize: '0.9em',
  },
  '.cm-table-header.cm-table-first-row': {
    borderRadius: '4px 4px 0 0',
  },
  '.cm-table-last-row': {
    borderRadius: '0 0 4px 4px',
  },
  '.cm-table-delimiter': {
    color: 'var(--md-text-faint, #666)',
  },
  // Hidden lines (when widget is shown)
  '.cm-table-line-hidden': {
    height: '0',
    overflow: 'hidden',
    padding: '0',
    border: 'none',
    lineHeight: '0',
    fontSize: '0',
  },

  // Front matter
  '.cm-frontmatter': {
    fontFamily: 'var(--md-code-font-family, "Fira Code", Consolas, monospace)',
    fontSize: '0.85em',
    color: 'var(--md-text-faint, #666)',
  },
});

/**
 * Adds the cm-markdown-wysiwyg class to the editor for CSS targeting.
 */
const editorAttributes = EditorView.editorAttributes.of({
  class: 'cm-markdown-wysiwyg',
});

/**
 * Returns a WYSIWYG extension for markdown files.
 * Hides markdown syntax when the cursor is not on the same line,
 * and reveals it when the cursor moves to that line.
 * Applies a prose-optimized theme with Tangent-inspired styling.
 * 
 * @param options - Configuration options
 * @param options.focusMode - Whether to enable focus mode initially (default: false)
 */
export function wysiwygExtension(options: { focusMode?: boolean } = {}): Extension {
  const { focusMode = false } = options;

  return [
    editorAttributes,
    markdownProseTheme,
    wysiwygWidgetTheme,
    embedResolverField,
    // List-aware Tab/Shift+Tab/Enter — must run before indentWithTab and default Enter
    Prec.high(keymap.of(listKeymap)),
    hideMarkupPlugin,
    linkClickHandler,
    focusModeExtension(focusMode),
    // Wiki-link support for [[link]] syntax
    wikiLinkExtension(),
    // Combined autocomplete for wiki-links [[ and code languages ```
    combinedAutocomplete(),
    // Slash command menu (/ at line start)
    slashCommandExtension(),
    // Code block syntax highlighting
    codeBlockHighlighter,
  ];
}
