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
import { syntaxTree } from '@codemirror/language';
import { isSelectRange, isFocusEvent, mouseSelectEffect } from './reveal-on-cursor';
import { wikiLinkRegex, getWikiLinkDisplayText } from '../wiki-link';
import { resolveWikiLink } from '../wiki-link-resolver';
import type { WikiLinkInfo, WikiLinkState } from '@cushion/types';

// =============================================================================
// State Effects and Fields for File Paths
// =============================================================================

/** Effect to update the file paths used for wiki-link resolution */
export const setFilePathsEffect = StateEffect.define<string[]>();

/** State field that holds the current file paths */
export const filePathsField = StateField.define<string[]>({
  create() {
    return [];
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFilePathsEffect)) {
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
  const filePaths = state.field(filePathsField, false) || [];
  
  // Collect Table ranges from syntax tree to skip wiki-link decoration inside tables
  const tableRanges: { from: number; to: number }[] = [];
  const tree = syntaxTree(state);
  for (const node of tree.topNode.getChildren('Table')) {
    tableRanges.push({ from: node.from, to: node.to });
  }

  // Find all wiki-links using regex
  const regex = new RegExp(wikiLinkRegex.source, 'g');
  let match;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    // Skip wiki-links inside table ranges
    if (tableRanges.some(t => start >= t.from && end <= t.to)) continue;

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
    const resolved = resolveWikiLink(href, filePaths);
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
    if (tr.docChanged || tr.selection || tr.effects.some(e => e.is(setFilePathsEffect) || e.is(mouseSelectEffect)) || isFocusEvent(tr)) {
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

export function wikiLinkExtension() {
  return [
    filePathsField,
    navigateCallbackField,
    wikiLinkDecorationsField,
    wikiLinkClickHandler,
  ];
}

/**
 * Update the file paths in an existing editor view.
 * Call this when the workspace file list changes.
 */
export function updateWikiLinkFilePaths(view: EditorView, filePaths: string[]) {
  view.dispatch({
    effects: setFilePathsEffect.of(filePaths),
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
