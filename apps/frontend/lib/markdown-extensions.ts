import type { BlockContext, LeafBlock, LeafBlockParser, MarkdownConfig } from '@lezer/markdown';

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
