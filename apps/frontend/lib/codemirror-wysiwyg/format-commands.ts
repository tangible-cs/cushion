import { EditorView, KeyBinding } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { toCodeMirrorKey } from '@/lib/shortcuts/utils';

/**
 * Word character pattern (matches Tangent's approach)
 */
const WORD_CHAR = /[\w\d_-]/;

/**
 * Find the word around a position in text.
 * Returns [start, end] offsets relative to the text.
 */
function findWordAround(text: string, position: number): [number, number] {
  // Search backward
  let start = position;
  while (start > 0 && WORD_CHAR.test(text[start - 1])) {
    start--;
  }

  // Search forward
  let end = position;
  while (end < text.length && WORD_CHAR.test(text[end])) {
    end++;
  }

  return [start, end];
}

/**
 * Find the word around cursor position in the document.
 */
function findWordAroundPosition(state: EditorState, pos: number): [number, number] {
  const line = state.doc.lineAt(pos);
  const lineText = line.text;
  const posInLine = pos - line.from;

  const [wordStart, wordEnd] = findWordAround(lineText, posInLine);
  return [line.from + wordStart, line.from + wordEnd];
}

/**
 * Syntax node names for different formatting types.
 */
const FORMAT_NODE_NAMES: Record<string, string[]> = {
  '**': ['StrongEmphasis'],
  '__': ['StrongEmphasis'],
  '*': ['Emphasis'],
  '_': ['Emphasis'],
  '~~': ['Strikethrough'],
  '`': ['InlineCode', 'CodeText'], // Different parsers may use different names
  '==': ['Highlight'], // Custom extension from markdown-extensions.ts
  '$': ['InlineMath'], // Custom extension from markdown-extensions.ts
};

/**
 * Find the range of a formatting node that contains the given position.
 * Returns null if position is not inside the specified formatting.
 */
function findFormattingRange(
  state: EditorState,
  pos: number,
  marker: string,
  altMarker?: string
): { from: number; to: number; marker: string } | null {
  const nodeNames = [
    ...(FORMAT_NODE_NAMES[marker] || []),
    ...(altMarker ? FORMAT_NODE_NAMES[altMarker] || [] : []),
  ];

  if (nodeNames.length === 0) return null;

  const tree = syntaxTree(state);
  let node = tree.resolveInner(pos, -1);

  // Walk up to find a formatting node
  while (node) {
    if (nodeNames.includes(node.type.name)) {
      // Determine which marker is used by checking the text
      const nodeText = state.doc.sliceString(node.from, node.to);
      let usedMarker = marker;
      if (altMarker && nodeText.startsWith(altMarker)) {
        usedMarker = altMarker;
      }
      return { from: node.from, to: node.to, marker: usedMarker };
    }
    if (!node.parent || node.parent === node) break;
    node = node.parent;
  }

  // Also check forward resolution
  node = tree.resolveInner(pos, 1);
  while (node) {
    if (nodeNames.includes(node.type.name)) {
      const nodeText = state.doc.sliceString(node.from, node.to);
      let usedMarker = marker;
      if (altMarker && nodeText.startsWith(altMarker)) {
        usedMarker = altMarker;
      }
      return { from: node.from, to: node.to, marker: usedMarker };
    }
    if (!node.parent || node.parent === node) break;
    node = node.parent;
  }

  return null;
}

/**
 * Toggle inline formatting (bold, italic, strikethrough, code, highlight).
 * - If cursor is inside formatted text: remove formatting
 * - If cursor is on a word with no selection: format the word
 * - If text is selected: format the selection
 */
function toggleInlineFormat(
  view: EditorView,
  marker: string,
  altMarker?: string
): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;
  const markerLen = marker.length;

  // Check if cursor is inside existing formatting
  const formattingRange = findFormattingRange(state, from, marker, altMarker);

  if (formattingRange) {
    // Toggle OFF - remove formatting markers
    const { from: fmtFrom, to: fmtTo, marker: usedMarker } = formattingRange;
    const usedLen = usedMarker.length;

    // Extract inner content (without markers)
    const innerContent = state.doc.sliceString(fmtFrom + usedLen, fmtTo - usedLen);

    // Calculate new cursor position
    // Keep cursor at same relative position within the content
    let newFrom = from;
    let newTo = to;

    // Adjust for removed opening marker
    if (from > fmtFrom) {
      newFrom = Math.max(fmtFrom, from - usedLen);
    }
    if (to > fmtFrom) {
      newTo = Math.max(fmtFrom, to - usedLen);
    }

    // Clamp to content bounds
    const contentEnd = fmtFrom + innerContent.length;
    newFrom = Math.min(newFrom, contentEnd);
    newTo = Math.min(newTo, contentEnd);

    view.dispatch({
      changes: { from: fmtFrom, to: fmtTo, insert: innerContent },
      selection: { anchor: newFrom, head: newTo },
    });
    return true;
  }

  // Determine target range
  let targetFrom = from;
  let targetTo = to;

  if (from === to) {
    // No selection - find word around cursor
    [targetFrom, targetTo] = findWordAroundPosition(state, from);

    // If no word found (cursor in whitespace), insert empty markers
    if (targetFrom === targetTo) {
      view.dispatch({
        changes: { from, to, insert: marker + marker },
        selection: { anchor: from + markerLen },
      });
      return true;
    }
  }

  // Toggle ON - wrap target with markers
  const selectedText = state.doc.sliceString(targetFrom, targetTo);

  // Determine cursor position after formatting
  let newAnchor: number;
  let newHead: number;

  if (from === to) {
    // Cursor was collapsed - check if it was at the end of the word
    if (from === targetTo) {
      // Cursor was at word end - place cursor AFTER closing marker
      newAnchor = targetFrom + markerLen + selectedText.length + markerLen;
      newHead = newAnchor;
    } else {
      // Cursor was inside word - maintain relative position
      const offsetInWord = from - targetFrom;
      newAnchor = targetFrom + markerLen + offsetInWord;
      newHead = newAnchor;
    }
  } else {
    // Had a selection - maintain selection around formatted content
    newAnchor = targetFrom + markerLen;
    newHead = targetFrom + markerLen + selectedText.length;
  }

  view.dispatch({
    changes: { from: targetFrom, to: targetTo, insert: marker + selectedText + marker },
    selection: { anchor: newAnchor, head: newHead },
  });

  return true;
}

/**
 * Toggle bold formatting (**text** or __text__)
 */
export function toggleBold(view: EditorView): boolean {
  return toggleInlineFormat(view, '**', '__');
}

/**
 * Toggle italic formatting (*text* or _text_)
 */
export function toggleItalic(view: EditorView): boolean {
  return toggleInlineFormat(view, '*', '_');
}

/**
 * Toggle strikethrough formatting (~~text~~)
 */
export function toggleStrikethrough(view: EditorView): boolean {
  return toggleInlineFormat(view, '~~');
}

/**
 * Toggle inline code formatting (`code`)
 */
export function toggleInlineCode(view: EditorView): boolean {
  return toggleInlineFormat(view, '`');
}

/**
 * Toggle highlight/mark formatting (==text==)
 */
export function toggleHighlight(view: EditorView): boolean {
  return toggleInlineFormat(view, '==');
}

/**
 * Toggle inline math formatting ($math$)
 */
export function toggleInlineMath(view: EditorView): boolean {
  return toggleInlineFormat(view, '$');
}

/**
 * Insert block math (multi-line format).
 * Creates a new block with $$ on separate lines.
 */
export function insertBlockMath(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;

  // Get selected text or word around cursor
  let content = '';
  let targetFrom = from;
  let targetTo = to;

  if (from !== to) {
    content = state.doc.sliceString(from, to);
  } else {
    const [wordStart, wordEnd] = findWordAroundPosition(state, from);
    if (wordStart !== wordEnd) {
      content = state.doc.sliceString(wordStart, wordEnd);
      targetFrom = wordStart;
      targetTo = wordEnd;
    }
  }

  // Build the block math template (no extra newlines outside)
  const blockMath = `$$\n${content}\n$$`;

  // Position cursor inside the block (after first $$\n)
  const cursorPos = targetFrom + 3 + content.length; // $$ + \n + content

  view.dispatch({
    changes: { from: targetFrom, to: targetTo, insert: blockMath },
    selection: { anchor: cursorPos },
  });

  return true;
}

/**
 * Insert or wrap with link syntax [text](url)
 */
export function insertLink(view: EditorView): boolean {
  const state = view.state;
  const { from, to } = state.selection.main;

  // Determine target range
  let targetFrom = from;
  let targetTo = to;

  if (from === to) {
    // No selection - find word around cursor
    [targetFrom, targetTo] = findWordAroundPosition(state, from);
  }

  const selectedText = state.doc.sliceString(targetFrom, targetTo);

  if (targetFrom === targetTo) {
    // No word found - insert link template
    view.dispatch({
      changes: { from, to, insert: '[](url)' },
      selection: { anchor: from + 1 }, // Place cursor inside []
    });
  } else {
    // Check if selection looks like a URL
    const isUrl = /^https?:\/\//.test(selectedText);
    if (isUrl) {
      // Wrap URL as link
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: `[](${selectedText})` },
        selection: { anchor: targetFrom + 1 }, // Place cursor inside [] for link text
      });
    } else {
      // Use selection/word as link text
      view.dispatch({
        changes: { from: targetFrom, to: targetTo, insert: `[${selectedText}](url)` },
        selection: { anchor: targetFrom + selectedText.length + 3, head: targetFrom + selectedText.length + 6 }, // Select "url"
      });
    }
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Exported keymap helpers                                           */
/* ------------------------------------------------------------------ */

export type FormatKeymapOptions = {
  bold?: string[];
  italic?: string[];
  strikethrough?: string[];
  inlineCode?: string[];
  highlight?: string[];
  link?: string[];
  inlineMath?: string[];
  blockMath?: string[];
};

function buildBindings(
  keys: string[] | undefined,
  run: (view: EditorView) => boolean
): KeyBinding[] {
  if (!keys || keys.length === 0) return [];
  const bindings: KeyBinding[] = [];
  keys.forEach((binding) => {
    const key = toCodeMirrorKey(binding);
    if (!key) return;
    bindings.push({ key, run });
  });
  return bindings;
}

export function createFormatKeymap(options: FormatKeymapOptions): KeyBinding[] {
  return [
    ...buildBindings(options.bold, toggleBold),
    ...buildBindings(options.italic, toggleItalic),
    ...buildBindings(options.strikethrough, toggleStrikethrough),
    ...buildBindings(options.inlineCode, toggleInlineCode),
    ...buildBindings(options.highlight, toggleHighlight),
    ...buildBindings(options.link, insertLink),
    ...buildBindings(options.inlineMath, toggleInlineMath),
    ...buildBindings(options.blockMath, insertBlockMath),
  ];
}
