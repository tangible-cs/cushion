import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markDecorationsPlugin, widgetDecorationsField, linkClickHandler, embedRevealedField } from './hide-markup';
import { diffTheme as aiDiffTheme } from './ai-diff';
import { hiddenRangesField, hiddenAtomicRanges } from './atomic-ranges';
import { focusState, focusListener, mouseSelectingField, mouseSelectionTracker } from './reveal-on-cursor';
import {
  wikiLinkExtension,
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';
import { combinedAutocomplete } from './combined-autocomplete';
import { slashCommandExtension } from './slash-command';
import { headingFoldExtension } from './heading-fold';
import { headingFoldGutterExtension } from './heading-fold-gutter';
import { tableExtension } from './table/table-extension';

export { focusModeExtension, setFocusMode, isFocusModeEnabled } from './focus-mode';

export {
  diffTheme,
  enterDiffReview,
  exitDiffReview,
  acceptAllChunks,
  rejectAllChunks,
  getChunkCount,
  diffReviewKeymap,
} from './ai-diff';

export {
  focusState,
  focusListener,
  hasFocus,
  isFocusEvent,
} from './reveal-on-cursor';

export {
  updateWikiLinkFileTree,
  setWikiLinkNavigateCallback,
  type WikiLinkNavigateCallback,
} from './wiki-link-plugin';

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
});

const wysiwygWidgetTheme = EditorView.baseTheme({
  '.cm-image-widget': {
    display: 'block',
  },
  '.cm-image-widget .cm-image': {
    maxWidth: '100%',
    width: 'auto',
    height: 'auto',
    borderRadius: 'var(--md-border-radius)',
    boxShadow: 'var(--md-image-shadow)',
    transition: 'box-shadow 0.2s ease',
  },
  '.cm-image-widget .cm-image:hover': {
    boxShadow: 'var(--md-image-shadow-hover)',
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
    fontWeight: '500',
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
    fontSize: '1.618em',
    fontWeight: '700',
    lineHeight: '1.2',
    letterSpacing: '-0.015em',
  },
  '.cm-heading-2': {
    fontSize: '1.462em',
    fontWeight: '600',
    lineHeight: '1.2',
    letterSpacing: '-0.011em',
  },
  '.cm-heading-3': {
    fontSize: '1.318em',
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '-0.008em',
  },
  '.cm-heading-4': {
    fontSize: '1.188em',
    fontWeight: '600',
    letterSpacing: '-0.005em',
  },
  '.cm-heading-5': {
    fontSize: '1.076em',
    fontWeight: '600',
    color: 'var(--md-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  '.cm-heading-6': {
    fontSize: '1em',
    fontWeight: '600',
    color: 'var(--md-text-muted)',
  },
  '.cm-blockquote': {
    borderLeft: '3px solid var(--md-blockquote-border)',
    paddingLeft: '16px',
    marginLeft: '8px',
    color: 'var(--md-blockquote-text)',
    fontStyle: 'italic',
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
    mouseSelectingField,
    mouseSelectionTracker,
    embedRevealedField,
    hiddenRangesField,
    hiddenAtomicRanges,
    markDecorationsPlugin,
    widgetDecorationsField,
    linkClickHandler,
    wikiLinkExtension(),
    combinedAutocomplete(),
    slashCommandExtension(),
    headingFoldExtension(),
    headingFoldGutterExtension(),
    tableExtension(),
    aiDiffTheme,
  ];
}
