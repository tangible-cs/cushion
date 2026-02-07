import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { EditorState, Range } from '@codemirror/state';
import { cursorInRange } from './reveal-on-cursor';
import { resolveWikiLink } from '../wiki-link-resolver';
import { fileTreeField } from './wiki-link-plugin';
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

function hideSubNodeMarks(
  node: { node: { cursor: () => { iterate: (cb: (node: { type: { name: string }; from: number; to: number }) => void) => void } } },
  names: string | string[],
  decorations: Range<Decoration>[],
): void {
  const isArray = Array.isArray(names);
  const cursor = node.node.cursor();
  cursor.iterate((child) => {
    const isMatch = isArray ? names.includes(child.type.name) : child.type.name === names;
    if (isMatch) {
      decorations.push(
        Decoration.mark({ class: 'cm-syntax-hidden' }).range(child.from, child.to),
      );
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

/**
 * Builds decorations for the WYSIWYG markdown display.
 * Hides syntax when cursor is not on the line, reveals when cursor is on line.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
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

      // --- Headings (H1-H6) ---
      if (/^ATXHeading[1-6]$/.test(type)) {
        const level = parseInt(type.charAt(type.length - 1), 10);

        // Always apply heading class so font size stays consistent (prevents cursor jumping)
        decorations.push(
          Decoration.line({
            class: `cm-heading-${level}`,
          }).range(state.doc.lineAt(from).from),
        );

        // Only hide the # markers when cursor is outside the heading range
        if (!cursorInRange(state, from, to)) {
          const child = node.node.getChild('HeaderMark');
          if (child) {
            const hideEnd = Math.min(child.to + 1, to);
            decorations.push(
              Decoration.mark({ class: 'cm-syntax-hidden' }).range(child.from, hideEnd),
            );
          }
        }
        return true;
      }

      // --- Bold (StrongEmphasis) ---
      if (type === 'StrongEmphasis') {
        if (!cursorInRange(state, from, to)) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations);
          decorations.push(
            Decoration.mark({ class: 'cm-strong-text' }).range(from, to),
          );
        }
        return false;
      }

      // --- Italic (Emphasis) ---
      if (type === 'Emphasis') {
        if (!cursorInRange(state, from, to)) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations);
          decorations.push(
            Decoration.mark({ class: 'cm-emphasis-text' }).range(from, to),
          );
        }
        return false;
      }

      // --- Strikethrough ---
      if (type === 'Strikethrough') {
        if (!cursorInRange(state, from, to)) {
          hideSubNodeMarks(node, 'StrikethroughMark', decorations);
          decorations.push(
            Decoration.mark({ class: 'cm-strikethrough-text' }).range(from, to),
          );
        }
        return false;
      }

      // --- Inline Code ---
      if (type === 'InlineCode') {
        if (!cursorInRange(state, from, to)) {
          hideSubNodeMarks(node, 'CodeMark', decorations);
          decorations.push(
            Decoration.mark({ class: 'cm-inline-code' }).range(from, to),
          );
        }
        return false;
      }

      // --- Links [text](url) ---
      if (type === 'Link') {
        if (!cursorInRange(state, from, to)) {
          const linkUrl = findLinkUrl(state, node);
          const attributes: Record<string, string> | undefined = linkUrl
            ? {
                title: linkUrl,
                'data-href': linkUrl,
              }
            : undefined;

          decorations.push(
            Decoration.mark({
              class: 'cm-link',
              attributes,
            }).range(from, to),
          );

          const childRanges = getChildRanges(node);
          for (const child of childRanges) {
            if (child.name === 'LinkMark' || child.name === 'URL') {
              decorations.push(
                Decoration.mark({ class: 'cm-syntax-hidden' }).range(child.from, child.to),
              );
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
              decorations.push(
                Decoration.mark({ class: 'cm-syntax-hidden' }).range(hideFrom, hideTo),
              );
            }
          }
        }
        return false;
      }

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

      // --- Blockquote ---
      if (type === 'Blockquote') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);

          // Always apply blockquote styling to keep line height stable
          decorations.push(
            Decoration.line({ class: 'cm-blockquote' }).range(line.from),
          );

          const qMatch = line.text.match(/^(>\s?)+/);
          if (qMatch) {
            const markerEnd = line.from + qMatch[0].length;
            // Only hide the > marker when cursor is outside the marker range
            if (!cursorInRange(state, line.from, markerEnd)) {
              decorations.push(
                Decoration.mark({ class: 'cm-syntax-hidden' }).range(line.from, markerEnd),
              );
            }
          }
        }
        return true;
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

      // --- Escape (\\) ---
      if (type === 'Escape') {
        if (!cursorInRange(state, from, to)) {
          hideSubNodeMarks(node, 'EscapeMark', decorations);
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

        if (isChecked) {
          decorations.push(
            Decoration.line({ class: 'cm-task-checked' }).range(line.from),
          );
        }

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

        // Task list items: hide the list marker so the checkbox is first
        if (parent && (parent.getChild('Task') || parent.getChild('TaskMarker'))) {
          const listRoot = parent.parent;
          const isBulletList = listRoot?.type?.name === 'BulletList';
          if (isBulletList) {
            if (!cursorInRange(state, from, hideEnd)) {
              decorations.push(
                Decoration.mark({ class: 'cm-syntax-hidden' }).range(from, hideEnd),
              );
            }
            return false;
          }
        }

        const isOrdered = /^\d+[.)]$/.test(text);
        const depth = getListNestingDepth(node.node);
        const styleDepth = depth % 3;
        const depthClass = `cm-list-depth-${Math.min(styleDepth, 2)}`;

        if (cursorInRange(state, from, hideEnd)) {
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

      // --- Tables (GFM) ---
      if (type === 'Table') {
        const cursorInside = cursorInRange(state, from, to);
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        if (cursorInside) {
          // Cursor inside: show raw syntax with line classes for stable height
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
          // Cursor outside: replace first line with rendered table widget,
          // hide remaining lines (same pattern as multi-line math)
          const rawText = state.doc.sliceString(from, to);
          const firstLine = state.doc.line(startLine);
          decorations.push(
            Decoration.replace({
              widget: new TableWidget(rawText),
            }).range(firstLine.from, firstLine.to),
          );
          for (let i = startLine + 1; i <= endLine; i++) {
            const line = state.doc.line(i);
            decorations.push(
              Decoration.line({ class: 'cm-table-line-hidden' }).range(line.from),
            );
          }
        }
        return true;
      }

      // --- Code blocks (fenced) ---
      if (type === 'FencedCode') {
        const cursorInside = cursorInRange(state, from, to);
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        // Extract language from the code fence
        let language = '';
        const codeInfo = node.node.getChild('CodeInfo');
        if (codeInfo) {
          const langText = state.doc.sliceString(codeInfo.from, codeInfo.to);
          language = langText.trim();
        }

        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          const isFirstLine = i === startLine;
          const isLastLine = i === endLine;

          // Hide fence lines when cursor is outside the code block
          // Use CSS-only hiding (no Decoration.replace) to preserve cursor navigation
          if (!cursorInside && (isFirstLine || isLastLine)) {
            if (!(isFirstLine && isLastLine)) {
              decorations.push(
                Decoration.line({
                  class: 'cm-code-fence-hidden',
                }).range(line.from),
              );
            }
            continue;
          }

          // Build classes for content lines (and fence lines when cursor is inside)
          const classes = ['cm-code-block'];
          if (isFirstLine) classes.push('cm-code-block-start');
          if (isLastLine) classes.push('cm-code-block-end');
          if (!cursorInside && i === startLine + 1) {
            // First content line gets the language badge when fences are hidden
            classes.push('cm-code-block-start');
          }
          if (!cursorInside && i === endLine - 1) {
            classes.push('cm-code-block-end');
          }
          if (language) {
            classes.push(`cm-code-block-lang-${language}`);
          }

          decorations.push(
            Decoration.line({
              class: classes.join(' '),
              attributes: language ? { 'data-lang': language } : undefined,
            }).range(line.from),
          );
        }
        return true;
      }

      return true;
    },
  });

  // --- Math/LaTeX detection ($...$ and $$...$$) ---
  // This needs to be done outside the tree iteration since markdown syntax tree
  // doesn't natively support math
  detectMathPatterns(state, decorations);

  // --- Wiki Embeds ![[file]] ---
  detectWikiEmbeds(state, decorations);

  // Sort decorations for proper application
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

/**
 * Detects multi-line block math: $$ on its own line, content lines, $$ on its own line.
 * When cursor is outside the block, hides all lines and shows a rendered widget.
 * When cursor is inside, reveals the raw syntax.
 */
function detectMultiLineMath(
  state: EditorState,
  text: string,
  decorations: Range<Decoration>[],
  ranges: { from: number; to: number }[],
): void {
  // Find $$ that appear alone on a line (with optional whitespace)
  const fenceRegex = /^[ \t]*\$\$[ \t]*$/gm;
  const fences: { from: number; to: number; line: number }[] = [];

  let m;
  while ((m = fenceRegex.exec(text)) !== null) {
    const line = state.doc.lineAt(m.index);
    fences.push({ from: line.from, to: line.to, line: line.number });
  }

  // Pair consecutive fences as open/close
  for (let i = 0; i < fences.length - 1; i += 2) {
    const open = fences[i];
    const close = fences[i + 1];

    // Extract LaTeX content between the fence lines
    const contentFrom = open.to + 1; // start of line after opening $$
    const contentTo = close.from - 1; // end of line before closing $$
    if (contentFrom > contentTo) continue; // empty block

    const latex = state.doc.sliceString(contentFrom, contentTo + 1).trim();
    if (!latex) continue;

    ranges.push({ from: open.from, to: close.to });

    // Check if cursor is inside the block range
    const cursorInBlock = cursorInRange(state, open.from, close.to);

    if (cursorInBlock) {
      // Show raw syntax with highlight on all lines
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(open.from, close.to),
      );
    } else {
      // Replace the opening $$ line content with the rendered widget
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(latex, true),
        }).range(open.from, open.to),
      );
      // Hide content lines and closing $$ line
      for (let lineNum = open.line + 1; lineNum <= close.line; lineNum++) {
        const ln = state.doc.line(lineNum);
        decorations.push(
          Decoration.line({ class: 'cm-math-fence-hidden' }).range(ln.from),
        );
      }
    }
  }
}

/**
 * Detects and decorates math patterns in the document.
 * Supports inline math ($...$), single-line block math ($$...$$),
 * and multi-line block math ($$ on separate lines).
 */
function detectMathPatterns(state: EditorState, decorations: Range<Decoration>[]): void {
  const text = state.doc.toString();

  // Pattern for single-line block math ($$...$$)
  const blockMathRegex = /\$\$([^\$\n]+?)\$\$/g;
  // Pattern for inline math ($...$) - single line only
  const inlineMathRegex = /\$([^$\n]+?)\$/g;

  // Track ranges covered by multi-line math to avoid conflicts
  const multiLineMathRanges: { from: number; to: number }[] = [];

  // Detect multi-line block math first: $$ on its own line ... $$ on its own line
  detectMultiLineMath(state, text, decorations, multiLineMathRanges);

  let match;

  // Detect single-line block math (avoid ranges already covered by multi-line)
  while ((match = blockMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = blockMathRegex.lastIndex;
    const latex = match[1].trim();

    // Skip if inside a multi-line math block
    if (multiLineMathRanges.some(r => from >= r.from && to <= r.to)) continue;

    const isCursorInside = cursorInRange(state, from, to);

    if (!isCursorInside) {
      // Render single-line block math with KaTeX widget
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(latex, true),
        }).range(from, to),
      );
    } else {
      // Cursor on line - show syntax
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(from, to),
      );
    }
  }

  // Reset regex for inline math
  inlineMathRegex.lastIndex = 0;

  // Detect inline math (but avoid block math patterns)
  while ((match = inlineMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = inlineMathRegex.lastIndex;
    const latex = match[1].trim();

    // Check if this is part of a block math pattern (look behind and ahead)
    const isPartOfBlockMath =
      (from > 0 && text[from - 1] === '$') ||
      (to < text.length && text[to] === '$');

    if (isPartOfBlockMath) continue;

    // Skip if inside a multi-line math block
    if (multiLineMathRanges.some(r => from >= r.from && to <= r.to)) continue;

    // Check if cursor is on the same line
    const isCursorInside = cursorInRange(state, from, to);

    if (!isCursorInside) {
      // Inline math is always single-line, safe to use widget
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(latex, false),
        }).range(from, to),
      );
    } else {
      // Show syntax when cursor is on line
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(from, to),
      );
    }
  }
}

function detectWikiEmbeds(state: EditorState, decorations: Range<Decoration>[]): void {
  const text = state.doc.toString();
  const fileTree = state.field(fileTreeField, false) || [];
  const resolver = state.field(embedResolverField, false);

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

export const hideMarkupPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    cursorPos: number;
    pendingUpdate: number | null = null;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state);
      this.cursorPos = view.state.selection.main.head;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.cursorPos = update.state.selection.main.head;
        this.decorations = buildDecorations(update.state);
        return;
      }

      if (update.selectionSet) {
        const newPos = update.state.selection.main.head;
        if (newPos === this.cursorPos) return;
        this.cursorPos = newPos;

        // Defer decoration rebuild to next frame so CodeMirror finishes
        // cursor positioning with stable geometry first
        if (this.pendingUpdate !== null) {
          cancelAnimationFrame(this.pendingUpdate);
        }
        this.pendingUpdate = requestAnimationFrame(() => {
          this.pendingUpdate = null;
          this.decorations = buildDecorations(update.view.state);
          update.view.requestMeasure();
        });
      }
    }

    destroy() {
      if (this.pendingUpdate !== null) {
        cancelAnimationFrame(this.pendingUpdate);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
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
