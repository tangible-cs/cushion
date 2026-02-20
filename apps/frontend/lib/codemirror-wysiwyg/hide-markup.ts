import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { EditorState, Range, StateField, StateEffect } from '@codemirror/state';
import { cursorInRange, isSelectRange, isSelectLine, isFocusEvent } from './reveal-on-cursor';
import { resolveWikiLink } from '../wiki-link-resolver';
import { fileTreeField, setFileTreeEffect } from './wiki-link-plugin';
import { embedResolverField } from './embed-resolver';
import { ImageWidget } from './widgets/image-widget';
import { EmbedWidget } from './widgets/embed-widget';
import { CheckboxWidget } from './widgets/checkbox-widget';
import { HrWidget } from './widgets/hr-widget';
import { MathWidget } from './widgets/math-widget';
import { TableWidget } from './widgets/table-widget';

/**
 * Counts list nesting depth by walking up the syntax tree.
 * Depth 0 = top-level list, 1 = first nesting, etc.
 */
function getListNestingDepth(syntaxNode: { parent: any; type: { name: string } }): number {
  let depth = 0;
  let current = syntaxNode.parent;
  while (current) {
    if (current.type.name === 'BulletList' || current.type.name === 'OrderedList') {
      depth++;
    }
    current = current.parent;
  }
  return Math.max(0, depth - 1);
}


/** Converts a number to lowercase alpha: 1→a, 2→b, ..., 26→z, 27→aa */
function numberToAlpha(n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

/** Converts a number to lowercase roman numerals: 1→i, 2→ii, 3→iii, 4→iv */
function numberToRoman(n: number): string {
  const values: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let result = '';
  for (const [value, numeral] of values) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

function hasListBreak(state: EditorState, from: number, to: number): boolean {
  if (from >= to) return false;
  const between = state.doc.sliceString(from, to);
  return /\n\s*\n/.test(between);
}

/**
 * Adds a hidden mark decoration with optional type-specific class.
 * Single-phase pattern: only called when cursor is NOT in range.
 */
function addHiddenMark(
  decorations: Range<Decoration>[],
  from: number,
  to: number,
  syntaxType: string,
): void {
  decorations.push(
    Decoration.mark({
      class: `cm-hidden cm-${syntaxType}-syntax`,
    }).range(from, to),
  );
}

/**
 * Hides sub-node marks using the single-phase pattern.
 * Only call this when cursor is NOT in the parent element range.
 */
function hideSubNodeMarks(
  node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } },
  names: string | string[],
  decorations: Range<Decoration>[],
  syntaxType: string,
): void {
  const isArray = Array.isArray(names);
  const cursor = node.node.cursor();
  cursor.iterate((child) => {
    const isMatch = isArray ? names.includes(child.type.name) : child.type.name === names;
    if (isMatch) {
      addHiddenMark(decorations, child.from, child.to, syntaxType);
    }
  });
}

function getChildRanges(node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } }) {
  const ranges: { name: string; from: number; to: number }[] = [];
  const cursor = node.node.cursor();
  cursor.iterate((child) => {
    ranges.push({ name: child.type.name, from: child.from, to: child.to });
  });
  return ranges;
}

function findLinkUrl(state: EditorState, node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } }): string | null {
  const ranges = getChildRanges(node);
  const urlNode = ranges.find((range) => range.name === 'URL');
  if (!urlNode) return null;
  return state.doc.sliceString(urlNode.from, urlNode.to);
}

const wikiEmbedRegex = /!\[\[([^\[\]|#\n]+)(#[^\[\]|#\n]*)?(\|[^\[\]\n]*)?\]\]/g;

function isInsideCode(state: EditorState, pos: number): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolve(pos, -1);
  while (node) {
    const name = node.type.name;
    if (name === 'InlineCode' || name === 'CodeText' || name === 'CodeBlock' || name === 'FencedCode') {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function isEmbedBlock(state: EditorState, from: number, to: number): boolean {
  const line = state.doc.lineAt(from);
  const before = line.text.slice(0, Math.max(0, from - line.from));
  const after = line.text.slice(Math.max(0, to - line.from));
  return before.trim().length === 0 && after.trim().length === 0;
}


function getBulletSymbol(depth: number): string {
  const bullets = ['•', '◦', '▪'];
  return bullets[Math.min(depth, 2)];
}

// =============================================================================
// State Effect for deferred widget updates
// =============================================================================

const cursorSettledEffect = StateEffect.define<null>();

// =============================================================================
// MARK DECORATIONS — Decoration.mark and Decoration.line only
// =============================================================================
// Safe in a StateField because these don't change line geometry:
// - cm-syntax-hidden uses font-size: 0 (no height change)
// - Line classes (cm-heading-*, cm-blockquote, etc.) are always applied
// =============================================================================

/**
 * Builds mark/line decorations for the WYSIWYG markdown display.
 * Does NOT produce any Decoration.replace widgets.
 */
function buildMarkDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

      // --- Front matter (YAML at document start) ---
      if (type === 'FrontMatter' || type === 'Frontmatter') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;
        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          decorations.push(
            Decoration.line({
              class: 'cm-frontmatter',
            }).range(line.from),
          );
        }
        return false;
      }

      // --- Headings (H1-H6) --- purrmd single-phase pattern
      if (/^ATXHeading[1-6]$/.test(type)) {
        const level = parseInt(type.charAt(type.length - 1), 10);

        // Always apply heading line class (stable geometry)
        decorations.push(
          Decoration.line({
            class: `cm-heading-${level}`,
          }).range(state.doc.lineAt(from).from),
        );

        // Single-phase: only hide when cursor is NOT in range.
        const child = node.node.getChild('HeaderMark');
        if (child) {
          const hideEnd = Math.min(child.to + 1, to);
          // Only hide if:
          // 1. Visible text remains after the marker (prevents posBefore errors)
          // 2. Cursor is NOT in the heading range
          if (hideEnd < to && !isSelectRange(state, { from, to })) {
            addHiddenMark(decorations, child.from, hideEnd, 'heading');
          }
        }
        return true;
      }

      // --- Bold (StrongEmphasis) --- purrmd single-phase pattern
      if (type === 'StrongEmphasis') {
        // Always apply bold styling (stable)
        decorations.push(
          Decoration.mark({ class: 'cm-strong-text' }).range(from, to),
        );

        // Single-phase: only hide ** when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations, 'emphasis');
        }
        return false;
      }

      // --- Italic (Emphasis) --- purrmd single-phase pattern
      if (type === 'Emphasis') {
        // Always apply italic styling (stable)
        decorations.push(
          Decoration.mark({ class: 'cm-emphasis-text' }).range(from, to),
        );

        // Single-phase: only hide * when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations, 'emphasis');
        }
        return false;
      }

      // --- Strikethrough --- purrmd single-phase pattern
      if (type === 'Strikethrough') {
        // Always apply strikethrough styling (stable)
        decorations.push(
          Decoration.mark({ class: 'cm-strikethrough-text' }).range(from, to),
        );

        // Single-phase: only hide ~~ when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'StrikethroughMark', decorations, 'strikethrough');
        }
        return false;
      }

      // --- Highlight ==text== --- purrmd single-phase pattern
      if (type === 'Highlight') {
        // Always apply highlight styling (stable)
        decorations.push(
          Decoration.mark({ class: 'cm-highlight-text' }).range(from, to),
        );

        // Single-phase: only hide == when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'HighlightMark', decorations, 'highlight');
        }
        return false;
      }

      // --- Inline Code --- purrmd single-phase pattern
      if (type === 'InlineCode') {
        // Always apply inline code styling (stable)
        decorations.push(
          Decoration.mark({ class: 'cm-inline-code' }).range(from, to),
        );

        // Single-phase: only hide ` when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'CodeMark', decorations, 'code');
        }
        return false;
      }

      // --- Links [text](url) --- purrmd single-phase pattern
      // Only style links that have an actual URL (not reference links like [text] or [text][ref])
      // Lezer parses [anything] as a Link node even without a URL, so we filter them out
      if (type === 'Link') {
        const linkUrl = findLinkUrl(state, node);

        // Skip styling if no URL - prevents [0,1,2] from being styled as a link
        if (!linkUrl) {
          return false;
        }

        // Apply link styling with href attributes
        decorations.push(
          Decoration.mark({
            class: 'cm-link',
            attributes: {
              title: linkUrl,
              'data-href': linkUrl,
            },
          }).range(from, to),
        );

        // Single-phase: only hide link syntax when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          const childRanges = getChildRanges(node);
          for (const child of childRanges) {
            if (child.name === 'LinkMark' || child.name === 'URL') {
              addHiddenMark(decorations, child.from, child.to, 'link');
            } else if (child.name === 'LinkTitle') {
              let hideFrom = child.from;
              let hideTo = child.to;
              if (hideFrom > 0) {
                const before = state.doc.sliceString(hideFrom - 1, hideFrom);
                if (before === '"' || before === "'") {
                  hideFrom -= 1;
                }
              }
              if (hideTo < state.doc.length) {
                const after = state.doc.sliceString(hideTo, hideTo + 1);
                if (after === '"' || after === "'") {
                  hideTo += 1;
                }
              }
              addHiddenMark(decorations, hideFrom, hideTo, 'link');
            }
          }
        }
        return false;
      }

      // --- Images: skip (widget function handles) ---
      if (type === 'Image') {
        return false;
      }

      // --- Blockquote --- purrmd single-phase pattern
      if (type === 'Blockquote') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);

          // Always apply blockquote line styling (stable geometry)
          decorations.push(
            Decoration.line({ class: 'cm-blockquote' }).range(line.from),
          );

          const qMatch = line.text.match(/^(>\s?)+/);
          if (qMatch) {
            const markerEnd = line.from + qMatch[0].length;
            // Only hide if:
            // 1. Visible text remains after the marker (empty blockquote lines keep marker visible)
            // 2. Cursor is NOT on this line
            if (markerEnd < line.to && !isSelectLine(state, line.from, line.to)) {
              addHiddenMark(decorations, line.from, markerEnd, 'blockquote');
            }
          }
        }
        return true;
      }

      // --- Horizontal rule: skip (widget function handles) ---
      if (type === 'HorizontalRule') {
        return false;
      }

      // --- Escape (\\) --- purrmd single-phase pattern
      if (type === 'Escape') {
        // Single-phase: only hide \ when cursor is NOT inside
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EscapeMark', decorations, 'escape');
        }
        return false;
      }

      // --- Task list items: line class only (widget function handles checkbox) ---
      if (type === 'TaskMarker') {
        const markerText = state.doc.sliceString(from, to);
        const isChecked = markerText.includes('x') || markerText.includes('X');
        if (isChecked) {
          const line = state.doc.lineAt(from);
          decorations.push(
            Decoration.line({ class: 'cm-task-checked' }).range(line.from),
          );
        }
        return false;
      }

      // --- List markers (bullets and numbers) ---
      if (type === 'ListMark') {
        const text = state.doc.sliceString(from, to);
        const parent = node.node.parent;
        const line = state.doc.lineAt(from);
        let offsetInLine = to - line.from;
        while (offsetInLine < line.text.length) {
          const ch = line.text[offsetInLine];
          if (ch !== ' ' && ch !== '\t') break;
          offsetInLine += 1;
        }
        const hideEnd = Math.min(line.from + offsetInLine, state.doc.length);

        // Task list items: hide the list marker so the checkbox is first (single-phase)
        if (parent && (parent.getChild('Task') || parent.getChild('TaskMarker'))) {
          const listRoot = parent.parent;
          const isBulletList = listRoot?.type?.name === 'BulletList';
          if (isBulletList) {
            // Single-phase: only hide if cursor is NOT in range
            // Task items have [x] or [ ] after the marker, so line.to check handles empty tasks
            if (hideEnd < line.to && !isSelectRange(state, { from, to: hideEnd })) {
              addHiddenMark(decorations, from, hideEnd, 'list');
            }
            return false;
          }
        }

        const isOrdered = /^\d+[.)]$/.test(text);
        const depth = getListNestingDepth(node.node);
        const styleDepth = depth % 3;
        const depthClass = `cm-list-depth-${Math.min(styleDepth, 2)}`;

        // Single-phase: show raw marker when cursor is in range
        if (isSelectRange(state, { from, to: hideEnd })) {
          decorations.push(
            Decoration.mark({
              class: `cm-list-marker ${depthClass}`,
            }).range(from, hideEnd),
          );
          return false;
        }

        // For ordered lists, compute the correct display number by
        // counting preceding ListItem siblings in the OrderedList parent,
        // then format based on nesting depth (1. → a. → i.)
        let displayText = text;
        if (isOrdered && parent && parent.type.name === 'ListItem') {
          const listParent = parent.parent;
          const suffix = text.endsWith(')') ? ')' : '.';
          let startNum = 1;
          let position = 0;
          if (listParent && listParent.type.name === 'OrderedList') {
            let segmentStart = parent;
            let sibling = parent.prevSibling;
            while (sibling) {
              if (hasListBreak(state, sibling.to, segmentStart.from)) break;
              if (sibling.type.name === 'ListItem') {
                position++;
                segmentStart = sibling;
              }
              sibling = sibling.prevSibling;
            }

            if (depth === 0) {
              const firstMark = segmentStart.getChild('ListMark');
              if (firstMark) {
                const parsed = parseInt(state.doc.sliceString(firstMark.from, firstMark.to), 10);
                if (!isNaN(parsed)) startNum = parsed;
              }
            }
          }

          const num = startNum + position;
          if (styleDepth === 0) {
            displayText = num + suffix;
          } else if (styleDepth === 1) {
            displayText = numberToAlpha(num) + suffix;
          } else {
            displayText = numberToRoman(num) + suffix;
          }
        } else {
          displayText = getBulletSymbol(styleDepth);
        }

        decorations.push(
          Decoration.mark({
            class: `cm-list-marker-hidden ${depthClass}`,
            attributes: {
              'data-list-marker': displayText,
            },
          }).range(from, hideEnd),
        );
        return false;
      }

      // --- Tables (GFM): skip, widget function handles all table decorations ---
      // We return true so the tree iterator recurses into table children
      // for inline mark decorations (bold, italic, etc. inside cells)

      // --- Code blocks (fenced) — Tangent-style stable geometry ---
      // ALL structural line classes (cm-code-block, cm-code-block-start/end,
      // cm-code-fence) are cursor-independent → geometry NEVER changes.
      // Fence text visibility is controlled purely by color (transparent ↔ visible)
      // via cm-code-fence / cm-code-fence-revealed → zero geometry changes,
      // zero measure loops, and CM can always resolve click positions.
      if (type === 'FencedCode') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        // Extract language from the code fence
        let language = '';
        const codeInfo = node.node.getChild('CodeInfo');
        if (codeInfo) {
          language = state.doc.sliceString(codeInfo.from, codeInfo.to).trim();
        }

        const cursorInside = isSelectRange(state, { from, to });

        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          const isFirstLine = i === startLine;
          const isLastLine = i === endLine;
          const isFence = isFirstLine || isLastLine;

          // Stable structural classes — never change based on cursor
          const classes = ['cm-code-block'];
          if (isFirstLine) classes.push('cm-code-block-start');
          if (isLastLine) classes.push('cm-code-block-end');
          if (isFence) {
            classes.push('cm-code-fence');
            // Color-only toggle: transparent by default, visible when revealed
            if (cursorInside) classes.push('cm-code-fence-revealed');
          }
          if (language) classes.push(`cm-code-block-lang-${language}`);

          decorations.push(
            Decoration.line({
              class: classes.join(' '),
              attributes: language && isFirstLine ? { 'data-lang': language } : undefined,
            }).range(line.from),
          );
        }

        return true;
      }

      return true;
    },
  });

  // Math: only mark decorations (cm-math-syntax when cursor IS inside)
  detectMathMarks(state, decorations, text);

  // Sort decorations for proper application
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

// =============================================================================
// WIDGET DECORATIONS — Decoration.replace widgets + paired line decorations
// =============================================================================
// These go in a ViewPlugin that defers selection-driven rebuilds via
// dispatch({ effects }) instead of requestMeasure(), avoiding measure loops.
// =============================================================================

/**
 * Builds widget (Decoration.replace) decorations for the WYSIWYG display.
 * Replaces entire multi-line structures (tables, math blocks) with single
 * widgets — no hidden-line hacks needed.
 */
function buildWidgetDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

      // --- Images ![alt](url) ---
      if (type === 'Image') {
        if (!cursorInRange(state, from, to)) {
          const text = state.doc.sliceString(from, to);
          const match = text.match(/^!\[([^\]]*)\]\((.+?)\)$/);
          if (match) {
            decorations.push(
              Decoration.replace({ widget: new ImageWidget(match[2], match[1]) }).range(from, to),
            );
          }
        }
        return false;
      }

      // --- Horizontal rule ---
      if (type === 'HorizontalRule') {
        if (!cursorInRange(state, from, to)) {
          decorations.push(
            Decoration.replace({ widget: new HrWidget() }).range(from, to),
          );
        }
        return false;
      }

      // --- Task list items (checkboxes) ---
      if (type === 'TaskMarker') {
        const markerText = state.doc.sliceString(from, to);
        const isChecked = markerText.includes('x') || markerText.includes('X');
        const line = state.doc.lineAt(from);
        const taskNode = node.node.parent;
        const listItem = taskNode?.parent;
        const listRoot = listItem?.parent;
        const listType = listRoot?.type?.name;
        const isBulletList = listType === 'BulletList';

        const listMatch = line.text.match(/^(\s*)([-*+]|\d+[.)])\s/);
        const listPrefixStart = listMatch ? line.from + listMatch[1].length : from;
        const listPrefixEnd = listMatch ? line.from + listMatch[0].length : from;
        const cursorInMarker = listMatch ? cursorInRange(state, listPrefixStart, listPrefixEnd) : false;

        if (!cursorInRange(state, from, to) && !cursorInMarker) {
          const stateValue = isChecked ? 'checked' : 'open';
          const replaceFrom = isBulletList ? listPrefixStart : from;

          decorations.push(
            Decoration.replace({
              widget: new CheckboxWidget(stateValue, from),
            }).range(replaceFrom, to),
          );
        }
        return false;
      }

      // --- Tables (GFM): ALL table decorations live here (geometry-changing) ---
      if (type === 'Table') {
        const cursorInside = cursorInRange(state, from, to);
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        if (cursorInside) {
          // Cursor inside: show raw syntax with line classes
          for (let i = startLine; i <= endLine; i++) {
            const line = state.doc.line(i);
            const classes = ['cm-table-row'];
            if (i === startLine) classes.push('cm-table-header', 'cm-table-first-row');
            if (i === startLine + 1) classes.push('cm-table-delimiter');
            if (i === endLine) classes.push('cm-table-last-row');
            decorations.push(
              Decoration.line({ class: classes.join(' ') }).range(line.from),
            );
          }
        } else {
          // Cursor outside: replace entire table with rendered widget
          const rawText = state.doc.sliceString(from, to);
          decorations.push(
            Decoration.replace({
              widget: new TableWidget(rawText),
            }).range(from, to),
          );
        }
        return false;
      }

      // --- Code blocks: handled entirely by mark field (Tangent-style stable geometry) ---
      if (type === 'FencedCode') {
        return false;
      }

      return true;
    },
  });

  // Math: widget decorations (MathWidget replaces full range when cursor is OUTSIDE)
  detectMathWidgets(state, decorations, text);

  // --- Wiki Embeds ![[file]] ---
  detectWikiEmbeds(state, decorations, text);

  // Sort decorations for proper application
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

// =============================================================================
// Math Detection — Split into mark and widget functions
// =============================================================================

/**
 * Collects multi-line math fence positions from the document.
 * Shared logic used by both mark and widget math detection.
 */
function collectMathFences(state: EditorState, text: string) {
  const fenceRegex = /^[ \t]*\$\$[ \t]*$/gm;
  const fences: { from: number; to: number; line: number }[] = [];
  let m;
  while ((m = fenceRegex.exec(text)) !== null) {
    const line = state.doc.lineAt(m.index);
    if (isInsideCode(state, m.index)) continue;
    fences.push({ from: line.from, to: line.to, line: line.number });
  }
  return fences;
}

/**
 * Pairs fences into math blocks and returns structured data.
 */
function pairMathFences(state: EditorState, fences: { from: number; to: number; line: number }[]) {
  const blocks: {
    openFrom: number; openTo: number; openLine: number;
    closeFrom: number; closeTo: number; closeLine: number;
    latex: string; rangeFrom: number; rangeTo: number;
  }[] = [];

  for (let i = 0; i < fences.length - 1; i += 2) {
    const open = fences[i];
    const close = fences[i + 1];
    const contentFrom = open.to + 1;
    const contentTo = close.from - 1;
    if (contentFrom > contentTo) continue;
    const latex = state.doc.sliceString(contentFrom, contentTo + 1).trim();
    if (!latex) continue;
    blocks.push({
      openFrom: open.from, openTo: open.to, openLine: open.line,
      closeFrom: close.from, closeTo: close.to, closeLine: close.line,
      latex, rangeFrom: open.from, rangeTo: close.to,
    });
  }
  return blocks;
}

/**
 * Emits mark decorations (cm-math-syntax) for math when cursor IS inside.
 */
function detectMathMarks(state: EditorState, decorations: Range<Decoration>[], text: string): void {
  const fences = collectMathFences(state, text);
  const blocks = pairMathFences(state, fences);
  const multiLineMathRanges = blocks.map(b => ({ from: b.rangeFrom, to: b.rangeTo }));

  // Multi-line block math
  for (const block of blocks) {
    if (isSelectRange(state, { from: block.rangeFrom, to: block.rangeTo })) {
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(block.rangeFrom, block.rangeTo),
      );
    }
  }

  // Inline math ($...$)
  let match;
  const inlineMathRegex = /\$([^$\n]+?)\$/g;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = inlineMathRegex.lastIndex;
    const isPartOfBlockMath =
      (from > 0 && text[from - 1] === '$') ||
      (to < text.length && text[to] === '$');
    if (isPartOfBlockMath) continue;
    if (multiLineMathRanges.some(r => from >= r.from && to <= r.to)) continue;
    if (isInsideCode(state, from)) continue;
    if (isSelectRange(state, { from, to })) {
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(from, to),
      );
    }
  }
}

/**
 * Emits widget decorations (MathWidget replaces full range) for math
 * when cursor is OUTSIDE.
 */
function detectMathWidgets(state: EditorState, decorations: Range<Decoration>[], text: string): void {
  const fences = collectMathFences(state, text);
  const blocks = pairMathFences(state, fences);
  const multiLineMathRanges = blocks.map(b => ({ from: b.rangeFrom, to: b.rangeTo }));

  // Multi-line block math
  for (const block of blocks) {
    if (!cursorInRange(state, block.rangeFrom, block.rangeTo)) {
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(block.latex, true),
        }).range(block.openFrom, block.closeTo),
      );
    }
  }

  // Inline math ($...$)
  let match;
  const inlineMathRegex = /\$([^$\n]+?)\$/g;
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = inlineMathRegex.lastIndex;
    const latex = match[1].trim();
    const isPartOfBlockMath =
      (from > 0 && text[from - 1] === '$') ||
      (to < text.length && text[to] === '$');
    if (isPartOfBlockMath) continue;
    if (multiLineMathRanges.some(r => from >= r.from && to <= r.to)) continue;
    if (isInsideCode(state, from)) continue;
    if (!cursorInRange(state, from, to)) {
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(latex, false),
        }).range(from, to),
      );
    }
  }
}

// =============================================================================
// Wiki Embeds detection (widget only)
// =============================================================================

function detectWikiEmbeds(state: EditorState, decorations: Range<Decoration>[], text: string): void {
  const fileTree = state.field(fileTreeField, false) || [];
  const resolver = state.field(embedResolverField, false) ?? null;

  wikiEmbedRegex.lastIndex = 0;
  let match;

  while ((match = wikiEmbedRegex.exec(text)) !== null) {
    const from = match.index;
    const to = wikiEmbedRegex.lastIndex;

    if (cursorInRange(state, from, to)) continue;
    if (isInsideCode(state, from)) continue;

    const href = match[1].trim();
    const contentId = match[2] ? match[2].slice(1).trim() : undefined;
    const displayText = match[3] ? match[3].slice(1).trim() : undefined;

    const resolved = resolveWikiLink(href, fileTree);
    const resolvedPath = resolved.targets[0] || null;
    const block = isEmbedBlock(state, from, to);

    decorations.push(
      Decoration.replace({
        widget: new EmbedWidget({
          href,
          resolvedPath,
          linkState: resolved.state,
          displayText,
          contentId,
          block,
          resolver,
        }),
      }).range(from, to),
    );
  }
}

// =============================================================================
// StateField for mark/line decorations
// =============================================================================
// Updates atomically with each transaction — no requestMeasure needed.
// Safe because mark decorations (cm-syntax-hidden, line classes) don't cause
// geometry changes that trigger measure loops.
// =============================================================================

export const markDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildMarkDecorations(state);
  },
  update(value, tr) {
    // Detect incremental parser advancement: the tree object changes identity
    // when the parser finishes a new chunk. Rebuilding here prevents stale
    // decorations from accumulating and causing a massive one-time rebuild later.
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    // Also rebuild on focus changes (purrmd pattern: reveal all when unfocused)
    if (tr.docChanged || tr.selection || treeChanged || isFocusEvent(tr)) {
      return buildMarkDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// StateField for widget/replace decorations
// =============================================================================
// Multi-line Decoration.replace MUST come from a StateField (CM requirement).
// Deferred updates: only rebuilds on docChanged (sync) or cursorSettledEffect
// (deferred via rAF from the scheduler plugin below). This prevents measure
// loops from geometry changes on every selection/tree change.
// =============================================================================

export const widgetDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildWidgetDecorations(state);
  },
  update(value, tr) {
    // Sync rebuild on doc changes
    if (tr.docChanged) {
      return buildWidgetDecorations(tr.state);
    }
    // Deferred rebuild when cursor has settled (rAF fired)
    if (tr.effects.some(e => e.is(cursorSettledEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    if (tr.effects.some(e => e.is(setFileTreeEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// =============================================================================
// ViewPlugin: rAF scheduler for deferred widget rebuilds
// =============================================================================
// Watches for selection changes and tree advancement, then dispatches
// cursorSettledEffect after a rAF delay. No decorations — purely a scheduler.
// =============================================================================

export const widgetUpdateScheduler = ViewPlugin.fromClass(
  class {
    pendingUpdate: number | null = null;

    update(update: ViewUpdate) {
      // On doc change the StateField already rebuilt synchronously — cancel any pending rAF
      if (update.docChanged) {
        if (this.pendingUpdate !== null) {
          cancelAnimationFrame(this.pendingUpdate);
          this.pendingUpdate = null;
        }
        return;
      }

      // Defer widget rebuild on selection change or tree advancement
      const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
      if (update.selectionSet || treeChanged) {
        if (this.pendingUpdate !== null) cancelAnimationFrame(this.pendingUpdate);
        this.pendingUpdate = requestAnimationFrame(() => {
          this.pendingUpdate = null;
          update.view.dispatch({ effects: cursorSettledEffect.of(null) });
        });
      }
    }

    destroy() {
      if (this.pendingUpdate !== null) {
        cancelAnimationFrame(this.pendingUpdate);
      }
    }
  },
);

/** Click handler for links: Ctrl+Click opens the URL */
export const linkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    if (!event.ctrlKey && !event.metaKey) return false;
    const target = event.target as HTMLElement;
    const href = target.getAttribute('data-href') || target.closest('[data-href]')?.getAttribute('data-href');
    if (href) {
      window.open(href, '_blank');
      return true;
    }
    return false;
  },
});
