import { StateField, RangeSet, RangeValue } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { wikiLinkRegex } from '../wiki-link';
import type { EditorState } from '@codemirror/state';

class HiddenRange extends RangeValue {}
const hiddenRange = new HiddenRange();

const childMarkTypes: Record<string, string> = {
  'StrongEmphasis': 'EmphasisMark',
  'Emphasis': 'EmphasisMark',
  'Strikethrough': 'StrikethroughMark',
  'Highlight': 'HighlightMark',
  'InlineCode': 'CodeMark',
  'Escape': 'EscapeMark',
};

function collectChildMarks(
  node: { node: { cursor: () => { iterate: (cb: (n: { type: { name: string }; from: number; to: number }) => void) => void } } },
  markName: string,
  ranges: { from: number; to: number }[],
) {
  node.node.cursor().iterate((child) => {
    if (child.type.name === markName) {
      ranges.push({ from: child.from, to: child.to });
    }
  });
}

function buildHiddenRanges(state: EditorState): RangeSet<HiddenRange> {
  const ranges: { from: number; to: number }[] = [];
  const tree = syntaxTree(state);

  tree.iterate({
    enter(node) {
      const type = node.type.name;

      if (type === 'Table') return false;

      if (/^ATXHeading[1-6]$/.test(type)) {
        const child = node.node.getChild('HeaderMark');
        if (child) {
          const hideEnd = Math.min(child.to + 1, node.to);
          if (hideEnd < node.to) {
            ranges.push({ from: child.from, to: hideEnd });
          }
        }
        return true;
      }

      const markName = childMarkTypes[type];
      if (markName) {
        collectChildMarks(node, markName, ranges);
        return false;
      }

      if (type === 'Link') {
        node.node.cursor().iterate((child) => {
          if (child.type.name === 'LinkMark' || child.type.name === 'URL') {
            ranges.push({ from: child.from, to: child.to });
          } else if (child.type.name === 'LinkTitle') {
            let hideFrom = child.from;
            let hideTo = child.to;
            if (hideFrom > 0) {
              const before = state.doc.sliceString(hideFrom - 1, hideFrom);
              if (before === '"' || before === "'") hideFrom -= 1;
            }
            if (hideTo < state.doc.length) {
              const after = state.doc.sliceString(hideTo, hideTo + 1);
              if (after === '"' || after === "'") hideTo += 1;
            }
            ranges.push({ from: hideFrom, to: hideTo });
          }
        });
        return false;
      }

      if (type === 'Blockquote') {
        const startLine = state.doc.lineAt(node.from).number;
        const endLine = state.doc.lineAt(Math.min(node.to, state.doc.length)).number;
        for (let i = startLine; i <= endLine; i++) {
          const line = state.doc.line(i);
          const qMatch = line.text.match(/^(>\s?)+/);
          if (qMatch) {
            const markerEnd = line.from + qMatch[0].length;
            if (markerEnd < line.to) {
              ranges.push({ from: line.from, to: markerEnd });
            }
          }
        }
        return true;
      }

      return true;
    },
  });

  const text = state.doc.toString();
  const tableRanges: { from: number; to: number }[] = [];
  for (const tNode of tree.topNode.getChildren('Table')) {
    tableRanges.push({ from: tNode.from, to: tNode.to });
  }

  const regex = new RegExp(wikiLinkRegex.source, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;

    if (tableRanges.some(t => start >= t.from && end <= t.to)) continue;

    const isEmbed = start > 0 && text[start - 1] === '!' && text[start - 2] !== '\\';
    if (isEmbed) continue;

    const openBracketEnd = start + 2;
    const closeBracketStart = end - 2;

    ranges.push({ from: start, to: openBracketEnd });

    if (match[3]) {
      const pipePos = text.indexOf('|', openBracketEnd);
      if (pipePos !== -1 && pipePos < closeBracketStart) {
        ranges.push({ from: openBracketEnd, to: pipePos + 1 });
      }
    }

    if (match[2] && !match[3]) {
      const hashPos = text.indexOf('#', openBracketEnd);
      if (hashPos !== -1 && hashPos < closeBracketStart) {
        ranges.push({ from: hashPos, to: closeBracketStart });
      }
    }

    ranges.push({ from: closeBracketStart, to: end });
  }

  ranges.sort((a, b) => a.from - b.from || a.to - b.to);

  const merged: { from: number; to: number }[] = [];
  for (const r of ranges) {
    if (r.from >= r.to) continue;
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to) {
      last.to = Math.max(last.to, r.to);
    } else {
      merged.push({ from: r.from, to: r.to });
    }
  }

  return RangeSet.of(
    merged.map(r => hiddenRange.range(r.from, r.to)),
    true,
  );
}

export const hiddenRangesField = StateField.define<RangeSet<HiddenRange>>({
  create(state) {
    return buildHiddenRanges(state);
  },
  update(value, tr) {
    if (tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return buildHiddenRanges(tr.state);
    }
    return value;
  },
});

export const hiddenAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.state.field(hiddenRangesField),
);
