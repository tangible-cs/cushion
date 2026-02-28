import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markDecorationsField, widgetDecorationsField, widgetUpdateScheduler, linkClickHandler } from './hide-markup';
import { focusState, focusListener } from './reveal-on-cursor';
import { embedResolverField, setEmbedResolver, type EmbedResolver, type EmbedResolverResult } from './embed-resolver';
import {
  wikiLinkExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';
import { combinedAutocomplete } from './combined-autocomplete';
import { codeBlockExtension } from './code-block';
import { slashCommandExtension } from './slash-command';
import { headingFoldExtension } from './heading-fold';
import { headingFoldGutterExtension } from './heading-fold-gutter';

export { focusModeExtension, setFocusMode, isFocusModeEnabled } from './focus-mode';

export {
  focusState,
  focusListener,
  hasFocus,
  isFocusEvent,
  isSelectRange,
} from './reveal-on-cursor';

export {
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';

export { setEmbedResolver, type EmbedResolver, type EmbedResolverResult } from './embed-resolver';

export {
  headingFoldExtension,
  toggleHeadingFold,
  foldAllHeadings,
  unfoldAllHeadings,
  headingFoldState,
  headingFoldInfoField,
} from './heading-fold';

export { headingFoldGutterExtension } from './heading-fold-gutter';

const markdownProseTheme = EditorView.theme({
  '&': {
    fontSize: 'var(--md-font-size, 16px)',
    backgroundColor: 'transparent',
    color: 'var(--md-text)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--md-font-family)',
    backgroundColor: 'transparent',
    paddingLeft: 'var(--md-content-padding-x, 1.25em)',
    paddingRight: 'var(--md-content-padding-x, 1.25em)',
  },
  '.cm-content': {
    maxWidth: 'var(--md-content-max-width, 800px)',
    paddingTop: '0',
    paddingBottom: '40vh !important',
    paddingLeft: '0',
    paddingRight: '0',
    caretColor: 'var(--md-text)',
    lineHeight: 'var(--md-baseline, 1.6)',
  },
  '.cm-line': {
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent !important',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--md-selection-bg) !important',
  },
});

const wysiwygWidgetTheme = EditorView.baseTheme({
  '.cm-image-widget': {
    display: 'block',
    margin: '16px 0',
  },
  '.cm-image-widget img': {
    maxWidth: '100%',
    maxHeight: '500px',
    borderRadius: 'var(--md-border-radius)',
    boxShadow: 'var(--md-image-shadow)',
    transition: 'box-shadow 0.2s ease, transform 0.2s ease',
  },
  '.cm-image-widget img:hover': {
    boxShadow: 'var(--md-image-shadow-hover)',
  },
  '.cm-checkbox-widget': {
    width: '16px',
    height: '16px',
    margin: '0 8px 0 0',
    verticalAlign: 'middle',
    cursor: 'pointer',
    accentColor: 'var(--md-accent)',
    borderRadius: '3px',
  },
  '.cm-list-bullet': {
    color: 'var(--md-accent)',
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
    color: 'var(--md-accent)',
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
  '.cm-list-bullet.cm-list-depth-0': { minWidth: '1.25em' },
  '.cm-list-bullet.cm-list-depth-1': { minWidth: '1.25em' },
  '.cm-list-bullet.cm-list-depth-2': { minWidth: '2.25em' },
  '.cm-list-marker.cm-list-depth-0': { minWidth: '1.25em' },
  '.cm-list-marker.cm-list-depth-1': { minWidth: '1.25em' },
  '.cm-list-marker.cm-list-depth-2': { minWidth: '2.25em' },
  '.cm-list-marker-hidden.cm-list-depth-0': { minWidth: '1.25em' },
  '.cm-list-marker-hidden.cm-list-depth-1': { minWidth: '1.25em' },
  '.cm-list-marker-hidden.cm-list-depth-2': { minWidth: '2.25em' },
  '.cm-line.cm-hr-line': {
    padding: '0',
  },
  '.cm-link-text': {
    color: 'var(--md-link-color)',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'color 0.15s ease',
    borderBottom: '1px solid transparent',
  },
  '.cm-link-text:hover': {
    color: 'var(--md-link-hover)',
    borderBottomColor: 'var(--md-link-hover)',
  },
  '.cm-inline-code': {
    fontFamily: 'var(--md-code-font-family)',
    fontSize: '0.9em',
    backgroundColor: 'var(--md-code-bg)',
    color: 'var(--md-code-text)',
    padding: '2px 6px',
    borderRadius: 'var(--md-border-radius-sm)',
    border: '1px solid var(--md-code-border)',
  },
  '.cm-strong-text': {
    fontWeight: '600',
  },
  '.cm-emphasis-text': {
    fontStyle: 'italic',
  },
  '.cm-strikethrough-text': {
    textDecoration: 'line-through',
    color: 'var(--md-text-muted)',
  },
  '.cm-highlight-text': {
    backgroundColor: 'var(--md-highlight-yellow)',
    borderRadius: '2px',
    padding: '1px 0',
  },
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
    color: 'var(--md-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  '.cm-heading-6': {
    fontSize: '0.9em',
    fontWeight: '500',
    fontStyle: 'italic',
    color: 'var(--md-text-muted)',
  },
  '.cm-blockquote': {
    borderLeft: '3px solid var(--md-blockquote-border)',
    paddingLeft: '16px',
    marginLeft: '8px',
    color: 'var(--md-blockquote-text)',
    fontStyle: 'italic',
  },
  '.cm-table-widget': {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '4px 0',
    fontSize: '0.95em',
  },
  '.cm-table-widget th, .cm-table-widget td': {
    padding: '6px 12px',
    borderBottom: '1px solid var(--md-border)',
  },
  '.cm-table-widget th': {
    fontWeight: '600',
    borderBottom: '2px solid var(--md-accent)',
  },
  '.cm-table-widget tbody tr:last-child td': {
    borderBottom: 'none',
  },
  '.cm-table-row': {
    backgroundColor: 'var(--md-code-bg)',
    padding: '2px 12px',
    fontFamily: 'var(--md-code-font-family)',
    fontSize: '0.9em',
  },
  '.cm-table-header.cm-table-first-row': {
    borderRadius: '4px 4px 0 0',
  },
  '.cm-table-last-row': {
    borderRadius: '0 0 4px 4px',
  },
  '.cm-table-delimiter': {
    color: 'var(--md-text-faint)',
  },
  '.cm-frontmatter': {
    fontFamily: 'var(--md-code-font-family)',
    fontSize: '0.85em',
    color: 'var(--md-text-faint)',
  },

});

const editorAttributes = EditorView.editorAttributes.of({
  class: 'cm-markdown-wysiwyg',
});

export function wysiwygExtension(): Extension {
  return [
    editorAttributes,
    markdownProseTheme,
    wysiwygWidgetTheme,
    focusState,
    focusListener,
    embedResolverField,
    markDecorationsField,
    widgetDecorationsField,
    widgetUpdateScheduler,
    linkClickHandler,
    wikiLinkExtension(),
    combinedAutocomplete(),
    slashCommandExtension(),
    codeBlockExtension(),
    headingFoldExtension(),
    headingFoldGutterExtension(),
  ];
}
