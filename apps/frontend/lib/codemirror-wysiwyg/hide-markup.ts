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
import { embedResolverField, setEmbedResolverEffect } from './embed-resolver';
import { ImageWidget } from './widgets/image-widget';
import { EmbedWidget } from './widgets/embed-widget';
import { CheckboxWidget } from './widgets/checkbox-widget';
import { MathWidget } from './widgets/math-widget';
import { TableWidget } from './widgets/table-widget';

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


function numberToAlpha(n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

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

function isExternalLinkUrl(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url.trim());
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

const cursorSettledEffect = StateEffect.define<null>();

function buildMarkDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

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

      if (/^ATXHeading[1-6]$/.test(type)) {
        const level = parseInt(type.charAt(type.length - 1), 10);

        decorations.push(
          Decoration.line({
            class: `cm-heading-${level}`,
          }).range(state.doc.lineAt(from).from),
        );

        const child = node.node.getChild('HeaderMark');
        if (child) {
          const hideEnd = Math.min(child.to + 1, to);
          if (hideEnd < to && !isSelectRange(state, { from, to })) {
            addHiddenMark(decorations, child.from, hideEnd, 'heading');
          }
        }
        return true;
      }

      if (type === 'StrongEmphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-strong-text' }).range(from, to),
        );
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations, 'emphasis');
        }
        return false;
      }

      if (type === 'Emphasis') {
        decorations.push(
          Decoration.mark({ class: 'cm-emphasis-text' }).range(from, to),
        );
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EmphasisMark', decorations, 'emphasis');
        }
        return false;
      }

      if (type === 'Strikethrough') {
        decorations.push(
          Decoration.mark({ class: 'cm-strikethrough-text' }).range(from, to),
        );
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'StrikethroughMark', decorations, 'strikethrough');
        }
        return false;
      }

      if (type === 'Highlight') {
        decorations.push(
          Decoration.mark({ class: 'cm-highlight-text' }).range(from, to),
        );
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'HighlightMark', decorations, 'highlight');
        }
        return false;
      }

      if (type === 'InlineCode') {
        if (!isSelectRange(state, { from, to })) {
          decorations.push(
            Decoration.mark({ class: 'cm-inline-code' }).range(from, to),
          );
          hideSubNodeMarks(node, 'CodeMark', decorations, 'code');
        }
        return false;
      }

      if (type === 'Link') {
        const linkUrl = findLinkUrl(state, node);

        if (!linkUrl) {
          return false;
        }

        const childRanges = getChildRanges(node);
        const isExternal = isExternalLinkUrl(linkUrl);

        decorations.push(
          Decoration.mark({
            class: 'cm-link',
            attributes: {
              title: linkUrl,
              'data-href': linkUrl,
              'data-external': isExternal ? 'true' : 'false',
            },
          }).range(from, to),
        );

        if (!isSelectRange(state, { from, to })) {
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
        } else {
          for (const child of childRanges) {
            if (child.name === 'LinkMark') {
              decorations.push(
                Decoration.mark({ class: 'cm-link-syntax' }).range(child.from, child.to),
              );
            }
          }
        }
        return false;
      }

      if (type === 'Image') {
        return false;
      }

      if (type === 'Blockquote') {
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);

          decorations.push(
            Decoration.line({ class: 'cm-blockquote' }).range(line.from),
          );

          const qMatch = line.text.match(/^(>\s?)+/);
          if (qMatch) {
            const markerEnd = line.from + qMatch[0].length;
            if (markerEnd < line.to && !isSelectLine(state, line.from, line.to)) {
              addHiddenMark(decorations, line.from, markerEnd, 'blockquote');
            }
          }
        }
        return true;
      }

      if (type === 'HorizontalRule') {
        const line = state.doc.lineAt(from);
        const cursorOnHr = isSelectLine(state, from, to);

        decorations.push(
          Decoration.line({
            class: cursorOnHr ? 'cm-hr-line cm-hr-line-revealed' : 'cm-hr-line',
          }).range(line.from),
        );
        decorations.push(
          Decoration.mark({
            class: cursorOnHr ? 'cm-hr-content cm-hr-content-revealed' : 'cm-hr-content',
          }).range(from, to),
        );
        return false;
      }

      if (type === 'Escape') {
        if (!isSelectRange(state, { from, to })) {
          hideSubNodeMarks(node, 'EscapeMark', decorations, 'escape');
        }
        return false;
      }

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

        if (parent && (parent.getChild('Task') || parent.getChild('TaskMarker'))) {
          const listRoot = parent.parent;
          const isBulletList = listRoot?.type?.name === 'BulletList';
          if (isBulletList) {
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

        if (isSelectRange(state, { from, to: hideEnd })) {
          decorations.push(
            Decoration.mark({
              class: `cm-list-marker ${depthClass}`,
            }).range(from, hideEnd),
          );
          return false;
        }

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

      if (type === 'FencedCode') {
        return false;
      }

      return true;
    },
  });

  detectMathMarks(state, decorations, text);

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

function buildWidgetDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      const type = node.type.name;
      const from = node.from;
      const to = node.to;

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

      if (type === 'HorizontalRule') {
        return false;
      }

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

      if (type === 'Table') {
        const cursorInside = cursorInRange(state, from, to);
        const startLine = state.doc.lineAt(from).number;
        const endLine = state.doc.lineAt(Math.min(to, state.doc.length)).number;

        if (cursorInside) {
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
          const rawText = state.doc.sliceString(from, to);
          decorations.push(
            Decoration.replace({
              widget: new TableWidget(rawText),
            }).range(from, to),
          );
        }
        return false;
      }

      return true;
    },
  });

  detectMathWidgets(state, decorations, text);
  detectWikiEmbeds(state, decorations, text);

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return Decoration.set(decorations, true);
}

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

function detectMathMarks(state: EditorState, decorations: Range<Decoration>[], text: string): void {
  const fences = collectMathFences(state, text);
  const blocks = pairMathFences(state, fences);
  const multiLineMathRanges = blocks.map(b => ({ from: b.rangeFrom, to: b.rangeTo }));

  for (const block of blocks) {
    if (isSelectRange(state, { from: block.rangeFrom, to: block.rangeTo })) {
      decorations.push(
        Decoration.mark({ class: 'cm-math-syntax' }).range(block.rangeFrom, block.rangeTo),
      );
    }
  }

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

function detectMathWidgets(state: EditorState, decorations: Range<Decoration>[], text: string): void {
  const fences = collectMathFences(state, text);
  const blocks = pairMathFences(state, fences);
  const multiLineMathRanges = blocks.map(b => ({ from: b.rangeFrom, to: b.rangeTo }));

  for (const block of blocks) {
    if (!cursorInRange(state, block.rangeFrom, block.rangeTo)) {
      decorations.push(
        Decoration.replace({
          widget: new MathWidget(block.latex, true),
        }).range(block.openFrom, block.closeTo),
      );
    }
  }

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

export const markDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildMarkDecorations(state);
  },
  update(value, tr) {
    const treeChanged = syntaxTree(tr.state) !== syntaxTree(tr.startState);
    if (tr.docChanged || tr.selection || treeChanged || isFocusEvent(tr)) {
      return buildMarkDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const widgetDecorationsField = StateField.define<DecorationSet>({
  create(state) {
    return buildWidgetDecorations(state);
  },
  update(value, tr) {
    if (tr.docChanged) {
      return buildWidgetDecorations(tr.state);
    }
    if (tr.effects.some(e => e.is(cursorSettledEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    if (tr.effects.some(e => e.is(setFileTreeEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    if (tr.effects.some(e => e.is(setEmbedResolverEffect))) {
      return buildWidgetDecorations(tr.state);
    }
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const widgetUpdateScheduler = ViewPlugin.fromClass(
  class {
    pendingUpdate: number | null = null;

    update(update: ViewUpdate) {
      if (update.docChanged) {
        if (this.pendingUpdate !== null) {
          cancelAnimationFrame(this.pendingUpdate);
          this.pendingUpdate = null;
        }
        return;
      }

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
