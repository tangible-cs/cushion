import type { BlockContext, LeafBlock, LeafBlockParser, MarkdownConfig, InlineContext } from '@lezer/markdown';
import { tags } from '@lezer/highlight';

class TaskParser implements LeafBlockParser {
  nextLine() {
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock) {
    cx.addLeafElement(
      leaf,
      cx.elt('Task', leaf.start, leaf.start + leaf.content.length, [
        cx.elt('TaskMarker', leaf.start, leaf.start + 3),
        ...cx.parser.parseInline(leaf.content.slice(3), leaf.start + 3),
      ]),
    );
    return true;
  }
}

export const TaskListWithCanceled: MarkdownConfig = {
  defineNodes: [
    { name: 'Task', block: true },
    { name: 'TaskMarker' },
  ],
  parseBlock: [
    {
      name: 'TaskList',
      leaf(cx, leaf) {
        return /^\[[ xX-]\][ \t]/.test(leaf.content) && cx.parentType().name === 'ListItem'
          ? new TaskParser()
          : null;
      },
      after: 'SetextHeading',
    },
  ],
};

export const Highlight: MarkdownConfig = {
  defineNodes: [
    { name: 'Highlight', style: tags.special(tags.emphasis) },
    { name: 'HighlightMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      parse(cx: InlineContext, next: number, pos: number) {
        // Check for == at current position
        if (next !== 61 /* = */ || cx.char(pos + 1) !== 61) return -1;

        // Look for closing ==
        let end = pos + 2;
        while (end < cx.end) {
          if (cx.char(end) === 61 && cx.char(end + 1) === 61) {
            // Found closing ==
            const content = cx.slice(pos + 2, end);
            if (content.length > 0) {
              return cx.addElement(
                cx.elt('Highlight', pos, end + 2, [
                  cx.elt('HighlightMark', pos, pos + 2),
                  ...cx.parser.parseInline(content, pos + 2),
                  cx.elt('HighlightMark', end, end + 2),
                ])
              );
            }
            return -1;
          }
          end++;
        }
        return -1;
      },
    },
  ],
};

export const DisableSetextHeading: MarkdownConfig = {
  remove: ['SetextHeading'],
};

export const InlineMath: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath', style: tags.special(tags.string) },
    { name: 'InlineMathMark', style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: 'InlineMath',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 36) return -1;
        if (cx.char(pos + 1) === 36) return -1;

        const afterOpen = cx.char(pos + 1);
        if (afterOpen === 32 || afterOpen === 9 || afterOpen === 10) return -1;

        let end = pos + 1;
        while (end < cx.end) {
          if (cx.char(end) === 36) {
            if (cx.char(end + 1) === 36) {
              end += 2;
              continue;
            }
            const beforeClose = cx.char(end - 1);
            if (beforeClose === 32 || beforeClose === 9 || beforeClose === 10) {
              end++;
              continue;
            }
            const content = cx.slice(pos + 1, end);
            if (content.length > 0) {
              return cx.addElement(
                cx.elt('InlineMath', pos, end + 1, [
                  cx.elt('InlineMathMark', pos, pos + 1),
                  cx.elt('InlineMathMark', end, end + 1),
                ])
              );
            }
            return -1;
          }
          end++;
        }
        return -1;
      },
    },
  ],
};

export const BlockMath: MarkdownConfig = {
  defineNodes: [
    { name: 'BlockMath', block: true },
    { name: 'BlockMathMark' },
  ],
  parseBlock: [
    {
      name: 'BlockMath',
      endLeaf(_, line) {
        return /^\$\$\s*$/.test(line.text);
      },
      parse(cx: BlockContext, line) {
        if (!/^\$\$\s*$/.test(line.text)) return false;
        const start = cx.lineStart;
        const openEnd = cx.lineStart + line.text.length;
        const children = [cx.elt('BlockMathMark', start, openEnd)];

        while (cx.nextLine()) {
          if (/^\$\$\s*$/.test(line.text)) {
            const closeStart = cx.lineStart;
            const closeEnd = cx.lineStart + line.text.length;
            children.push(cx.elt('BlockMathMark', closeStart, closeEnd));
            cx.addElement(cx.elt('BlockMath', start, closeEnd, children));
            cx.nextLine();
            return true;
          }
        }

        cx.addElement(cx.elt('BlockMath', start, cx.lineStart, children));
        return true;
      },
      before: 'FencedCode',
    },
  ],
};
