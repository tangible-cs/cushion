import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';

const TABLE_SECTION_NODE_NAMES = new Set(['TableHeader', 'TableRow']);

function isTableCellContextNode(node: SyntaxNode | null): boolean {
  let hasTableAncestor = false;
  let hasTableSectionAncestor = false;

  let current = node;
  while (current) {
    if (current.type.name === 'Table') {
      hasTableAncestor = true;
    }

    if (TABLE_SECTION_NODE_NAMES.has(current.type.name)) {
      hasTableSectionAncestor = true;
    }

    current = current.parent;
  }

  return hasTableAncestor && hasTableSectionAncestor;
}

/**
 * Returns true when the cursor is inside a markdown table header/body cell area.
 */
export function isCursorInTableCell(state: EditorState, pos: number): boolean {
  const clampedPos = Math.max(0, Math.min(pos, state.doc.length));
  const line = state.doc.lineAt(clampedPos);

  if (clampedPos <= line.from || clampedPos >= line.to) {
    return false;
  }

  const tree = syntaxTree(state);
  return (
    isTableCellContextNode(tree.resolveInner(clampedPos, -1))
    || isTableCellContextNode(tree.resolveInner(clampedPos, 1))
  );
}
