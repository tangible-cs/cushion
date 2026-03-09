/**
 * CodeMirror Wiki-Link Plugin
 * 
 * Provides decorations and click handling for [[wiki-links]].
 * Similar to Tangent's implementation:
 *   - Hides [[ and ]] brackets when cursor is not on the line
 *   - Styles links based on resolution state (resolved/empty/ambiguous)
 *   - Handles Ctrl+Click to navigate to linked file
 */

import {
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { EditorState, Range, StateField, StateEffect } from '@codemirror/state';
import { isSelectRange, isFocusEvent } from './reveal-on-cursor';
import { wikiLinkRegex, getWikiLinkDisplayText } from '../wiki-link';
import { resolveWikiLink, flattenFileTree } from '../wiki-link-resolver';
import type { FileTreeNode, WikiLinkInfo, WikiLinkState } from '@cushion/types';

// =============================================================================
// State Effects and Fields for File Tree
// =============================================================================

/** Effect to update the file tree used for wiki-link resolution */
export const setFileTreeEffect = StateEffect.define<FileTreeNode[]>();

/** State field that holds the current file tree */
export const fileTreeField = StateField.define<FileTreeNode[]>({
  create() {
    return [];
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFileTreeEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// =============================================================================
// Navigation Callback
// =============================================================================

/** Callback type for wiki-link navigation */
export type WikiLinkNavigateCallback = (
  href: string,
  resolvedPath: string | null,
  createIfMissing: boolean
) => void;

/** Effect to set the navigation callback */
export const setNavigateCallbackEffect = StateEffect.define<WikiLinkNavigateCallback | null>();

/** State field for the navigation callback */
export const navigateCallbackField = StateField.define<WikiLinkNavigateCallback | null>({
  create() {
    return null;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setNavigateCallbackEffect)) {
        return effect.value;
      }
    }
    return value;
  },
});

// =============================================================================
// Wiki-Link Decoration Builder
// =============================================================================

/**
 * Parse and decorate wiki-links in the document.
 */
function buildWikiLinkDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const fileTree = state.field(fileTreeField, false) || [];
  
  // Find all wiki-links using regex
  const regex = new RegExp(wikiLinkRegex.source, 'g');
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    const isEmbed = start > 0 && text[start - 1] === '!' && text[start - 2] !== '\\';
    if (isEmbed) continue;
    
    // Parse the link components
    const rawHref = match[1].trim();
    const contentId = match[2] ? match[2].slice(1).trim() : undefined;
    const displayText = match[3] ? match[3].slice(1).trim() : undefined;
    const href = displayText && rawHref.endsWith('\\')
      ? rawHref.slice(0, -1)
      : rawHref;
    
    // Resolve the link
    const resolved = resolveWikiLink(href, fileTree);
    const linkState = resolved.state;
    const resolvedPath = resolved.targets[0] || null;
    
    // Calculate positions
    const openBracketEnd = start + 2; // After [[
    const closeBracketStart = end - 2; // Before ]]
    
    // Content positions (the visible part)
    let contentStart = openBracketEnd;
    let contentEnd = closeBracketStart;
    
    // If there's a display text (|...), only show that
    if (match[3]) {
      // Find the pipe position
      const pipePos = text.indexOf('|', openBracketEnd);
      if (pipePos !== -1 && pipePos < closeBracketStart) {
        contentStart = pipePos + 1;
      }
    }
    
    // Check if cursor/selection overlaps this wiki-link range (purrmd pattern)
    const isInLink = isSelectRange(state, { from: start, to: end });

    // =============================================================================
    // Single-Phase Pattern (purrmd style)
    // =============================================================================
    // Only add hidden decoration when cursor is NOT in range.
    // No revealed marks needed — syntax is visible by default.
    // =============================================================================

    if (!isInLink) {
      // Hide opening brackets [[
      decorations.push(
        Decoration.mark({ class: 'cm-hidden cm-wikilink-syntax' }).range(start, openBracketEnd),
      );

      // If there's display text, also hide the href|
      if (match[3]) {
        const pipePos = text.indexOf('|', openBracketEnd);
        if (pipePos !== -1 && pipePos < closeBracketStart) {
          decorations.push(
            Decoration.mark({ class: 'cm-hidden cm-wikilink-syntax' }).range(openBracketEnd, pipePos + 1),
          );
        }
      }

      // Also hide content ID if present (just show file name when not focused)
      if (match[2] && !match[3]) {
        const hashPos = text.indexOf('#', openBracketEnd);
        if (hashPos !== -1 && hashPos < closeBracketStart) {
          decorations.push(
            Decoration.mark({ class: 'cm-hidden cm-wikilink-syntax' }).range(hashPos, closeBracketStart),
          );
        }
      }

      // Hide closing brackets ]]
      decorations.push(
        Decoration.mark({ class: 'cm-hidden cm-wikilink-syntax' }).range(closeBracketStart, end),
      );
    } else {
      // When revealed, keep bracket glyphs muted for better visual hierarchy.
      decorations.push(
        Decoration.mark({ class: 'cm-wiki-link-bracket' }).range(start, openBracketEnd),
      );
      decorations.push(
        Decoration.mark({ class: 'cm-wiki-link-bracket' }).range(closeBracketStart, end),
      );
    }

    // Style the link content - this is always shown, not hidden
    const actualContentStart = isInLink ? openBracketEnd : contentStart;
    const actualContentEnd = isInLink ? closeBracketStart : contentEnd;

    // Only add mark if there's content to mark
    if (actualContentEnd > actualContentStart) {
      decorations.push(
        Decoration.mark({
          class: `cm-wiki-link cm-wiki-link-${linkState}`,
          attributes: {
            'data-wiki-link': 'true',
            'data-href': href,
            'data-resolved-path': resolvedPath || '',
            'data-link-state': linkState,
            title: resolvedPath || `Create "${href}"`,
          },
        }).range(actualContentStart, actualContentEnd)
      );
    }
  }
  
  // Sort decorations
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

// =============================================================================
// Wiki-Link StateField
// =============================================================================
// Uses a StateField instead of ViewPlugin to eliminate requestMeasure() calls.
// Wiki-link decorations are all Decoration.mark (no replace widgets), so they're
// safe in a StateField — mark decorations update atomically with transactions
// and don't cause geometry changes that trigger measure loops.
// =============================================================================

export const wikiLinkDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildWikiLinkDecorations(state);
  },
  update(value, tr) {
    // Also rebuild on focus changes (purrmd pattern: reveal all when unfocused)
    if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(setFileTreeEffect)) || isFocusEvent(tr)) {
      return buildWikiLinkDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// Wiki-Link Click Handler
// =============================================================================

/**
 * Click handler for wiki-links.
 * Regular click navigates to the linked file (like Obsidian).
 * Ctrl+Click also works.
 */
export const wikiLinkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (event.button !== 0) return false;

    const target = event.target as HTMLElement | null;
    const wikiLinkEl = target?.closest?.('[data-wiki-link="true"]') as HTMLElement | null;

    if (!wikiLinkEl) return false;

    const href = wikiLinkEl.getAttribute('data-href');
    const resolvedPathAttr = wikiLinkEl.getAttribute('data-resolved-path');
    const linkState = wikiLinkEl.getAttribute('data-link-state') as WikiLinkState;

    if (!href) return false;

    const navigate = view.state.field(navigateCallbackField, false);

    if (navigate) {
      const createIfMissing = linkState === 'empty';
      const resolvedPath = resolvedPathAttr && resolvedPathAttr.length > 0 ? resolvedPathAttr : null;

      navigate(href, resolvedPath, createIfMissing);
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    return false;
  },
});

// =============================================================================
// Combined Extension
// =============================================================================

/**
 * Returns the wiki-link extension bundle.
 * 
 * @param options.fileTree - Initial file tree for resolution
 * @param options.onNavigate - Callback when a wiki-link is clicked
 */
export function wikiLinkExtension(options?: {
  fileTree?: FileTreeNode[];
  onNavigate?: WikiLinkNavigateCallback;
}) {
  const extensions = [
    fileTreeField,
    navigateCallbackField,
    wikiLinkDecorationsField,
    wikiLinkClickHandler,
  ];
  
  // Add initial effects if options provided
  // Note: These need to be applied via transactions after editor creation
  
  return extensions;
}

/**
 * Update the file tree in an existing editor view.
 * Call this when the workspace file tree changes.
 */
export function updateWikiLinkFileTree(view: EditorView, fileTree: FileTreeNode[]) {
  view.dispatch({
    effects: setFileTreeEffect.of(fileTree),
  });
}

/**
 * Set the navigation callback in an existing editor view.
 */
export function setWikiLinkNavigateCallback(
  view: EditorView,
  callback: WikiLinkNavigateCallback | null
) {
  view.dispatch({
    effects: setNavigateCallbackEffect.of(callback),
  });
}
