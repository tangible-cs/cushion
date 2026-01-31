import {
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { EditorState, Range } from '@codemirror/state';
import { cursorOnLine, cursorInRange } from './reveal-on-cursor';
import { ImageWidget } from './widgets/image-widget';
import { CheckboxWidget } from './widgets/checkbox-widget';
import { HrWidget } from './widgets/hr-widget';
import { MathWidget } from './widgets/math-widget';
import { TableWidget } from './widgets/table-widget';

/**
 * Bullet widget for list items.
 * Renders a styled bullet or number for list items.
 */
class BulletWidget extends WidgetType {
  constructor(readonly symbol: string, readonly isOrdered: boolean = false) {
    super();
  }
  
  eq(other: BulletWidget) {
    return this.symbol === other.symbol && this.isOrdered === other.isOrdered;
  }
  
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-list-bullet';
    // Use a proper bullet character for unordered lists
    span.textContent = this.isOrdered ? this.symbol : '•';
    return span;
  }
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

        // Only hide the # markers when cursor is off the line
        if (!cursorOnLine(state, from)) {
          const child = node.node.getChild('HeaderMark');
          if (child) {
            const hideEnd = Math.min(child.to + 1, to);
            decorations.push(Decoration.replace({}).range(child.from, hideEnd));
          }
        }
        return true;
      }

      // --- Bold (StrongEmphasis) ---
      if (type === 'StrongEmphasis') {
        if (!cursorOnLine(state, from)) {
          // Hide ** or __
          decorations.push(Decoration.replace({}).range(from, from + 2));
          decorations.push(Decoration.replace({}).range(to - 2, to));
          // Style the content
          decorations.push(
            Decoration.mark({ class: 'cm-strong-text' }).range(from + 2, to - 2),
          );
        }
        return false;
      }

      // --- Italic (Emphasis) ---
      if (type === 'Emphasis') {
        if (!cursorOnLine(state, from)) {
          // Hide * or _
          decorations.push(Decoration.replace({}).range(from, from + 1));
          decorations.push(Decoration.replace({}).range(to - 1, to));
          // Style the content
          decorations.push(
            Decoration.mark({ class: 'cm-emphasis-text' }).range(from + 1, to - 1),
          );
        }
        return false;
      }

      // --- Strikethrough ---
      if (type === 'Strikethrough') {
        if (!cursorOnLine(state, from)) {
          // Hide ~~
          decorations.push(Decoration.replace({}).range(from, from + 2));
          decorations.push(Decoration.replace({}).range(to - 2, to));
          // Style the content
          decorations.push(
            Decoration.mark({ class: 'cm-strikethrough-text' }).range(from + 2, to - 2),
          );
        }
        return false;
      }

      // --- Inline Code ---
      if (type === 'InlineCode') {
        if (!cursorOnLine(state, from)) {
          // Hide backticks
          decorations.push(Decoration.replace({}).range(from, from + 1));
          decorations.push(Decoration.replace({}).range(to - 1, to));
          // Style the content
          decorations.push(
            Decoration.mark({ class: 'cm-inline-code' }).range(from + 1, to - 1),
          );
        }
        return false;
      }

      // --- Links [text](url) ---
      if (type === 'Link') {
        if (!cursorOnLine(state, from)) {
          const text = state.doc.sliceString(from, to);
          const match = text.match(/^\[(.+?)\]\((.+?)\)$/);
          if (match) {
            const linkText = match[1];
            const linkUrl = match[2];
            const textStart = from + 1;
            const textEnd = from + 1 + linkText.length;
            
            // Hide opening [
            decorations.push(Decoration.replace({}).range(from, from + 1));
            
            // Style the link text
            decorations.push(
              Decoration.mark({
                class: 'cm-link-text',
                attributes: {
                  title: linkUrl,
                  'data-href': linkUrl,
                },
              }).range(textStart, textEnd),
            );
            
            // Hide ](url)
            decorations.push(Decoration.replace({}).range(textEnd, to));
          }
        }
        return false;
      }

      // --- Images ![alt](url) ---
      if (type === 'Image') {
        if (!cursorOnLine(state, from)) {
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

          // Only hide the > marker when cursor is off the line
          if (!cursorOnLine(state, line.from)) {
            const qMatch = line.text.match(/^(>\s?)+/);
            if (qMatch) {
              decorations.push(Decoration.replace({}).range(line.from, line.from + qMatch[0].length));
            }
          }
        }
        return true;
      }

      // --- Horizontal rule ---
      if (type === 'HorizontalRule') {
        if (!cursorOnLine(state, from)) {
          decorations.push(
            Decoration.replace({ widget: new HrWidget() }).range(from, to),
          );
        }
        return false;
      }

      // --- Task list items (checkboxes) ---
      if (type === 'TaskMarker') {
        if (!cursorOnLine(state, from)) {
          const markerText = state.doc.sliceString(from, to);
          const checked = markerText.includes('x') || markerText.includes('X');
          const line = state.doc.lineAt(from);
          const listMatch = line.text.match(/^(\s*[-*+]\s)/);
          const listPrefixEnd = listMatch ? line.from + listMatch[0].length : from;
          
          decorations.push(
            Decoration.replace({
              widget: new CheckboxWidget(checked, from),
            }).range(listPrefixEnd, to),
          );
        }
        return false;
      }

      // --- List markers (bullets and numbers) ---
      if (type === 'ListMark') {
        if (!cursorOnLine(state, from)) {
          const text = state.doc.sliceString(from, to);
          const parent = node.node.parent;
          
          // Don't process if this is part of a task list
          if (parent && parent.getChild('TaskMarker')) return false;

          const isOrdered = /^\d+[.)]$/.test(text);
          const hideEnd = Math.min(to + 1, state.doc.length);
          
          decorations.push(
            Decoration.replace({ 
              widget: new BulletWidget(text, isOrdered) 
            }).range(from, hideEnd),
          );
        }
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
  cursorLine: { number: number },
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

    // Check if cursor is on any line within this block
    const cursorInBlock =
      cursorLine.number >= open.line && cursorLine.number <= close.line;

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
  const cursor = state.selection.main.head;
  const cursorLine = state.doc.lineAt(cursor);

  // Pattern for single-line block math ($$...$$)
  const blockMathRegex = /\$\$([^\$\n]+?)\$\$/g;
  // Pattern for inline math ($...$) - single line only
  const inlineMathRegex = /\$([^$\n]+?)\$/g;

  // Track ranges covered by multi-line math to avoid conflicts
  const multiLineMathRanges: { from: number; to: number }[] = [];

  // Detect multi-line block math first: $$ on its own line ... $$ on its own line
  detectMultiLineMath(state, text, cursorLine, decorations, multiLineMathRanges);

  let match;

  // Detect single-line block math (avoid ranges already covered by multi-line)
  while ((match = blockMathRegex.exec(text)) !== null) {
    const from = match.index;
    const to = blockMathRegex.lastIndex;
    const latex = match[1].trim();

    // Skip if inside a multi-line math block
    if (multiLineMathRanges.some(r => from >= r.from && to <= r.to)) continue;

    const matchLine = state.doc.lineAt(from);
    const isCursorOnLine = matchLine.number === cursorLine.number;

    if (!isCursorOnLine) {
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
    const matchLine = state.doc.lineAt(from);
    const isCursorOnLine = matchLine.number === cursorLine.number;

    if (!isCursorOnLine) {
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

export const hideMarkupPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    cursorLineNumber: number;
    pendingUpdate: number | null = null;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view.state);
      this.cursorLineNumber = view.state.doc.lineAt(view.state.selection.main.head).number;
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.cursorLineNumber = update.state.doc.lineAt(update.state.selection.main.head).number;
        this.decorations = buildDecorations(update.state);
        return;
      }

      if (update.selectionSet) {
        const newLine = update.state.doc.lineAt(update.state.selection.main.head).number;
        if (newLine === this.cursorLineNumber) {
          // Same line — no geometry changes needed, skip rebuild
          return;
        }
        this.cursorLineNumber = newLine;

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
