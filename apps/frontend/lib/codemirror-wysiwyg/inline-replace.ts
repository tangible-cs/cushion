import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Range } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { hasFocus, isFocusEvent, isMousePressed, mouseSelectEffect } from './reveal-on-cursor';
import { wikiLinkRegex } from '../wiki-link';
import { getListNestingDepth, computeListDisplayText } from './list-utils';
import { ListPrefixWidget } from './widgets/list-marker-widget';

/** Node types handled by this plugin, mapped to their child mark node name */
const inlineMarkTypes: Record<string, string> = {
  'StrongEmphasis': 'EmphasisMark',
  'Emphasis': 'EmphasisMark',
  'Strikethrough': 'StrikethroughMark',
  'Highlight': 'HighlightMark',
  'InlineCode': 'CodeMark',
};

function shouldRevealInline(state: EditorState, from: number, to: number): boolean {
  if (!hasFocus(state)) return false;
  return state.selection.ranges.some((r) => {
    if (r.empty) return r.head >= from && r.head <= to;
    const selFrom = Math.min(r.head, r.anchor);
    const selTo = Math.max(r.head, r.anchor);
    return selFrom < to && selTo > from;
  });
}

function shouldRevealLine(state: EditorState, from: number): boolean {
  if (!hasFocus(state)) return false;
  const doc = state.doc;
  const lineNum = doc.lineAt(from).number;
  return state.selection.ranges.some((r) => {
    if (r.empty) return doc.lineAt(r.head).number === lineNum;
    const selFromLine = doc.lineAt(Math.min(r.head, r.anchor)).number;
    const selToLine = doc.lineAt(Math.max(r.head, r.anchor)).number;
    return selFromLine <= lineNum && selToLine >= lineNum;
  });
}

function buildInlineReplaceDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const replace = Decoration.replace({});

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const type = node.type.name;

        // Tables use mark/line decorations from the table plugin — skip replace
        // decorations inside tables to avoid conflicting with cell boundaries.
        if (type === 'Table') return false;

        // ATX Heading: hide # marks + trailing space (Zettlr pattern)
        if (/^ATXHeading[1-6]$/.test(type)) {
          if (!shouldRevealLine(state, node.from)) {
            const mark = node.node.getChild('HeaderMark');
            if (mark) {
              const span = state.sliceDoc(mark.to, node.to);
              let offset = 0;
              while (span.charAt(offset) === ' ') {
                offset++;
              }
              const hideEnd = mark.to + offset;
              if (hideEnd < node.to) {
                ranges.push(replace.range(mark.from, hideEnd));
              }
            }
          }
          return; // continue into children for inline marks (bold/italic inside headings)
        }

        // Blockquote: descend into children for inline marks + QuoteMark handling
        if (type === 'Blockquote') return;

        // QuoteMark: hide `>` marker per line (Joplin pattern)
        if (type === 'QuoteMark') {
          const line = state.doc.lineAt(node.from);
          if (shouldRevealLine(state, line.from)) return false;
          // Hide `>` plus trailing spaces (up to 3, like Zettlr)
          const match = /^(>[ ]{0,3})/.exec(state.sliceDoc(node.from, node.from + 4));
          ranges.push(replace.range(node.from, match ? node.from + match[1].length : node.to));
          return false;
        }

        // ListItem: replace leading indent whitespace on continuation lines with prefix widget
        if (type === 'ListItem') {
          const depth = getListNestingDepth(node.node);
          const depth1Based = Math.min(depth + 1, 9);
          const listMark = node.node.getChild('ListMark');
          if (!listMark) return; // incomplete parse tree — skip to avoid overlap with ListMark branch
          const markLineNum = state.doc.lineAt(listMark.from).number;
          const startLine = state.doc.lineAt(node.from).number;
          const endLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;

          // Collect child list line ranges so we skip lines they own (they handle their own decorations)
          // Use line numbers, not char positions — Lezer's BulletList.from may start at the
          // marker char (after indent), not at the line start, so char-based checks miss the first line.
          const childListLines = [
            ...node.node.getChildren('BulletList'),
            ...node.node.getChildren('OrderedList'),
          ].map(c => ({
            start: state.doc.lineAt(c.from).number,
            end: state.doc.lineAt(Math.min(c.to, state.doc.length)).number,
          }));

          for (let i = startLine; i <= endLine; i++) {
            if (i === markLineNum) continue; // handled by ListMark branch
            if (childListLines.some(c => i >= c.start && i <= c.end)) continue;
            const contLine = state.doc.line(i);
            let wsEnd = 0;
            while (wsEnd < contLine.text.length && (contLine.text[wsEnd] === ' ' || contLine.text[wsEnd] === '\t')) wsEnd++;
            if (wsEnd > 0) {
              if (depth1Based >= 2) {
                // Insert prefix widget with indent guides (no bullet)
                ranges.push(
                  Decoration.replace({
                    widget: new ListPrefixWidget(depth1Based, false, ''),
                  }).range(contLine.from, contLine.from + wsEnd),
                );
              } else {
                ranges.push(replace.range(contLine.from, contLine.from + wsEnd));
              }
            }
          }
          return; // continue into children
        }

        // ListMark: always replace marker + trailing spaces with prefix widget;
        // when cursor is on the line, swap widget text to raw marker (no layout shift)
        if (type === 'ListMark') {
          const parent = node.node.parent;
          const line = state.doc.lineAt(node.from);

          // Compute hideEnd: marker + trailing whitespace
          let offsetInLine = node.to - line.from;
          while (offsetInLine < line.text.length) {
            const ch = line.text[offsetInLine];
            if (ch !== ' ' && ch !== '\t') break;
            offsetInLine += 1;
          }
          const hideEnd = Math.min(line.from + offsetInLine, state.doc.length);

          const depth = getListNestingDepth(node.node);
          const depth1Based = Math.min(depth + 1, 9);
          const rawMarker = state.sliceDoc(node.from, node.to);
          const revealed = shouldRevealLine(state, node.from);

          // Task list in BulletList: prefix widget with empty displayText (checkbox handles the visual)
          if (parent && (parent.getChild('Task') || parent.getChild('TaskMarker'))) {
            const listRoot = parent.parent;
            if (listRoot?.type?.name === 'BulletList') {
              if (hideEnd < line.to) {
                ranges.push(
                  Decoration.replace({
                    widget: new ListPrefixWidget(depth1Based, true, '', rawMarker, revealed),
                  }).range(line.from, hideEnd),
                );
              }
              return false;
            }
          }

          // Normal case: replace from line.from to hideEnd with ListPrefixWidget
          const displayText = computeListDisplayText(state, rawMarker, parent, depth);
          ranges.push(
            Decoration.replace({
              widget: new ListPrefixWidget(depth1Based, true, displayText, rawMarker, revealed),
            }).range(line.from, hideEnd),
          );
          return false;
        }

        // Escape has no children — hide backslash directly (Zettlr pattern)
        if (type === 'Escape') {
          if (!shouldRevealInline(state, node.from, node.to)) {
            ranges.push(replace.range(node.from, node.from + 1));
          }
          return false;
        }

        // Link: hide two contiguous ranges — `[` and `](url)` (Zettlr pattern)
        if (type === 'Link') {
          if (!shouldRevealInline(state, node.from, node.to)) {
            // Skip links with no URL — must match hide-markup.ts guard so
            // replace decorations are only applied when cm-link styling exists
            const urlNode = node.node.getChild('URL');
            if (!urlNode || urlNode.from === urlNode.to) return false;

            const marks = node.node.getChildren('LinkMark');
            const label = node.node.getChild('LinkLabel');

            if (marks.length >= 3 || label) {
              // Safety: don't hide if link text is empty (marks[0].to === marks[1].from)
              if (marks.length >= 2 && marks[0].to !== marks[1].from) {
                ranges.push(
                  replace.range(marks[0].from, marks[0].to),
                  replace.range(marks[1].from, label ? label.to : marks[marks.length - 1].to),
                );
              }
            }
          }
          return false;
        }

        const markChildName = inlineMarkTypes[type];
        if (!markChildName) return;

        if (shouldRevealInline(state, node.from, node.to)) return false;

        for (const child of node.node.getChildren(markChildName)) {
          ranges.push(replace.range(child.from, child.to));
        }
      },
    });
  }

  // Replace leading tabs on non-list lines (indentation handled by cm-indent-line-N padding)
  const indentSkipped = new Set([
    'ListItem', 'BulletList', 'OrderedList',
    'FencedCode', 'CodeBlock', 'Blockquote',
    'FrontMatter', 'Frontmatter', 'BlockMath',
    'Table', 'HTMLBlock',
  ]);

  for (const { from, to } of view.visibleRanges) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = state.doc.line(i);
      if (line.length === 0 || line.text.charCodeAt(0) !== 9) continue;

      let skip = false;
      const resolved = syntaxTree(state).resolveInner(line.from, 1);
      for (let n: typeof resolved | null = resolved; n; n = n.parent) {
        if (indentSkipped.has(n.type.name)) { skip = true; break; }
      }
      if (skip) continue;

      let tabEnd = 0;
      while (tabEnd < line.text.length && line.text.charCodeAt(tabEnd) === 9) tabEnd++;
      if (tabEnd > 0) {
        ranges.push(replace.range(line.from, line.from + tabEnd));
      }
    }
  }

  return Decoration.set(ranges, true);
}

function extendSelectionForInlineMarks(view: EditorView): void {
  const { state } = view;
  const sel = state.selection;
  let changed = false;

  const newRanges = sel.ranges.map((r) => {
    if (r.empty) return r;

    let selFrom = Math.min(r.head, r.anchor);
    let selTo = Math.max(r.head, r.anchor);
    const origFrom = selFrom;
    const origTo = selTo;

    syntaxTree(state).iterate({
      from: selFrom,
      to: selTo,
      enter(node) {
        if (node.type.name in inlineMarkTypes || node.type.name === 'Escape' || node.type.name === 'Link') {
          if (node.from < selFrom) selFrom = node.from;
          if (node.to > selTo) selTo = node.to;
          return false;
        }
      },
    });

    // Also extend for wiki-links (regex-based, not in syntax tree)
    const text = state.doc.toString();
    const wikiRegex = new RegExp(wikiLinkRegex.source, 'g');
    let wikiMatch;
    while ((wikiMatch = wikiRegex.exec(text)) !== null) {
      const mStart = wikiMatch.index;
      const mEnd = mStart + wikiMatch[0].length;
      if (mStart > selTo) break;
      if (mStart >= mEnd) continue;
      const isEmbed = mStart > 0 && text[mStart - 1] === '!' && text[mStart - 2] !== '\\';
      if (isEmbed) continue;
      if (mStart < selTo && mEnd > selFrom) {
        if (mStart < selFrom) selFrom = mStart;
        if (mEnd > selTo) selTo = mEnd;
      }
    }

    if (selFrom !== origFrom || selTo !== origTo) {
      changed = true;
      const isForward = r.head >= r.anchor;
      return EditorSelection.range(
        isForward ? selFrom : selTo,
        isForward ? selTo : selFrom,
      );
    }
    return r;
  });

  if (changed) {
    view.dispatch({
      selection: EditorSelection.create(newRanges, sel.mainIndex),
    });
  }
}

export const inlineReplacePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineReplaceDecorations(view);
    }
    update(update: ViewUpdate) {
      const treeChanged = syntaxTree(update.state) !== syntaxTree(update.startState);
      const focusEvent = update.transactions.some(tr => isFocusEvent(tr));
      const mouseJustReleased = update.transactions.some(tr =>
        tr.effects.some(e => e.is(mouseSelectEffect) && !e.value)
      );

      if (
        update.docChanged ||
        update.viewportChanged ||
        treeChanged ||
        focusEvent ||
        mouseJustReleased
      ) {
        this.decorations = buildInlineReplaceDecorations(update.view);
      } else if (update.selectionSet && !isMousePressed()) {
        this.decorations = buildInlineReplaceDecorations(update.view);
      }

      if (mouseJustReleased && !update.state.selection.main.empty) {
        queueMicrotask(() => extendSelectionForInlineMarks(update.view));
      }
    }
  },
  { decorations: (v) => v.decorations },
);
