import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';

import { buildWikiLinkCompletionInsert } from '../combined-autocomplete';
import { isCursorInTableCell } from './table-context';

function createMarkdownState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ extensions: [Table] })],
  });
}

function positionAfter(text: string, needle: string): number {
  const index = text.indexOf(needle);
  if (index === -1) {
    throw new Error(`Could not find needle: ${needle}`);
  }
  return index + needle.length;
}

function applyCompletionWithContext(options: {
  template: string;
  href: string;
  displayText: string;
}): string {
  const marker = '__COMPLETE__';
  const markerIndex = options.template.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('Missing completion marker in template');
  }

  const doc = options.template.replace(marker, '');
  const state = createMarkdownState(doc);
  const inTableCell = isCursorInTableCell(state, markerIndex);
  const insert = buildWikiLinkCompletionInsert(options.href, {
    displayText: options.displayText,
    inTableCell,
  });

  return `${doc.slice(0, markerIndex)}${insert}${doc.slice(markerIndex + 2)}`;
}

describe('isCursorInTableCell', () => {
  it('TBL-E03 detects a cursor inside a table cell', () => {
    const doc = '| Link | Note |\n| --- | --- |\n| [[roadmap | pending |';
    const state = createMarkdownState(doc);
    const pos = positionAfter(doc, '[[roadmap');

    expect(isCursorInTableCell(state, pos)).toBe(true);
  });

  it('returns false for table delimiter row positions', () => {
    const doc = '| Link | Note |\n| --- | --- |\n| [[roadmap | pending |';
    const state = createMarkdownState(doc);
    const pos = positionAfter(doc, '| ---');

    expect(isCursorInTableCell(state, pos)).toBe(false);
  });

  it('TBL-E08 returns false outside table cells', () => {
    const doc = 'Paragraph: [[target|Alias]]\n\n| A | B |\n| --- | --- |\n| one | two |';
    const state = createMarkdownState(doc);
    const pos = positionAfter(doc, 'Paragraph: [[target|Alias]]');

    expect(isCursorInTableCell(state, pos)).toBe(false);
  });
});

describe('table-aware wiki-link completion writes', () => {
  it('TBL-E03 writes escaped alias separator in table context', () => {
    expect(buildWikiLinkCompletionInsert('roadmap', { displayText: 'Q2 Plan', inTableCell: true }))
      .toBe('roadmap\\|Q2 Plan]]');
  });

  it('TBL-E03 serializes exact markdown for table-cell completion writes', () => {
    const actual = applyCompletionWithContext({
      template: '| Link | Note |\n| --- | --- |\n| [[__COMPLETE__]] | pending |',
      href: 'roadmap',
      displayText: 'Q2 Plan',
    });

    expect(actual).toBe('| Link | Note |\n| --- | --- |\n| [[roadmap\\|Q2 Plan]] | pending |');
  });

  it('TBL-E08 keeps raw alias separator outside table context', () => {
    expect(buildWikiLinkCompletionInsert('roadmap', { displayText: 'Plan', inTableCell: false }))
      .toBe('roadmap|Plan]]');
  });

  it('TBL-E08 serializes exact markdown outside table context', () => {
    const actual = applyCompletionWithContext({
      template: 'Paragraph: [[target|Alias]] [[__COMPLETE__]]\n\n| A | B |\n| --- | --- |\n| one | two |',
      href: 'roadmap',
      displayText: 'Plan',
    });

    expect(actual).toBe('Paragraph: [[target|Alias]] [[roadmap|Plan]]\n\n| A | B |\n| --- | --- |\n| one | two |');
  });
});
