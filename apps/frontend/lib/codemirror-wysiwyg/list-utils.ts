import type { EditorState } from '@codemirror/state';

export function getListNestingDepth(syntaxNode: { parent: any; type: { name: string } }): number {
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

export function getBulletSymbol(_depth: number): string {
  return '•';
}

export function numberToAlpha(n: number): string {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(97 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

export function numberToRoman(n: number): string {
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

export function hasListBreak(state: EditorState, from: number, to: number): boolean {
  if (from >= to) return false;
  const between = state.doc.sliceString(from, to);
  return /\n\s*\n/.test(between);
}

/**
 * Compute the display text for a list marker.
 * @param state Editor state
 * @param markerText Raw marker text (e.g., "-", "*", "1.")
 * @param listItemNode The ListItem parent node
 * @param depth Nesting depth (0-based)
 */
export function computeListDisplayText(
  state: EditorState,
  markerText: string,
  listItemNode: any,
  depth: number,
): string {
  const isOrdered = /^\d+[.)]$/.test(markerText);
  const styleDepth = depth % 3;

  if (!isOrdered) {
    return getBulletSymbol(styleDepth);
  }

  if (!listItemNode || listItemNode.type?.name !== 'ListItem') {
    return markerText;
  }

  const listParent = listItemNode.parent;
  const suffix = markerText.endsWith(')') ? ')' : '.';
  let startNum = 1;
  let position = 0;

  if (listParent && listParent.type.name === 'OrderedList') {
    let segmentStart = listItemNode;
    let sibling = listItemNode.prevSibling;
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
  return num + suffix;
}
