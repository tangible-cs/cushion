import { describe, expect, it } from 'vitest';

import {
  createWikiEmbed,
  createWikiLink,
  escapeForTableCell,
  findAllWikiLinks,
  parseWikiLink,
} from './wiki-link';

function rewriteFirstWikiLinkHref(doc: string, nextHref: string, inTableCell: boolean): string {
  const links = findAllWikiLinks(doc);
  if (links.length === 0) {
    throw new Error('No wiki-links found to rewrite');
  }

  const first = links[0];
  const replacement = createWikiLink(nextHref, {
    contentId: first.contentId,
    displayText: first.displayText,
    inTableCell,
  });

  return `${doc.slice(0, first.start)}${replacement}${doc.slice(first.end)}`;
}

describe('wiki-link table-safe write helpers', () => {
  it('TBL-E03 writes escaped alias separators inside table context', () => {
    expect(createWikiLink('roadmap', { displayText: 'Q2 Plan', inTableCell: true }))
      .toBe('[[roadmap\\|Q2 Plan]]');
  });

  it('TBL-E03 serializes exact markdown for table-cell alias insertion', () => {
    const actual = '| Link | Note |\n| --- | --- |\n| __CELL__ | pending |'
      .replace('__CELL__', createWikiLink('roadmap', { displayText: 'Q2 Plan', inTableCell: true }));

    expect(actual).toBe('| Link | Note |\n| --- | --- |\n| [[roadmap\\|Q2 Plan]] | pending |');
  });

  it('TBL-E04 writes escaped embed separators inside table context', () => {
    expect(createWikiEmbed('diagram.png', { displayText: '200', inTableCell: true }))
      .toBe('![[diagram.png\\|200]]');
  });

  it('TBL-E04 serializes exact markdown for table-cell embed insertion', () => {
    const actual = '| Image | Status |\n| --- | --- |\n| __CELL__ | draft |'
      .replace('__CELL__', createWikiEmbed('diagram.png', { displayText: '200', inTableCell: true }));

    expect(actual).toBe('| Image | Status |\n| --- | --- |\n| ![[diagram.png\\|200]] | draft |');
  });

  it('TBL-E08 keeps non-table separators unescaped', () => {
    expect(createWikiLink('roadmap', { displayText: 'Plan' }))
      .toBe('[[roadmap|Plan]]');
  });

  it('TBL-E08 serializes exact markdown outside table context', () => {
    const actual = 'Paragraph: [[target|Alias]] __APPEND__\n\n| A | B |\n| --- | --- |\n| one | two |'
      .replace('__APPEND__', createWikiLink('roadmap', { displayText: 'Plan' }));

    expect(actual).toBe('Paragraph: [[target|Alias]] [[roadmap|Plan]]\n\n| A | B |\n| --- | --- |\n| one | two |');
  });

  it('escapes only unescaped pipes in generated table text', () => {
    expect(escapeForTableCell('Q2 | Plan \\| Keep')).toBe('Q2 \\| Plan \\| Keep');
  });
});

describe('wiki-link escaped separator parsing', () => {
  it('TBL-E05 parses escaped table separators without leaking backslashes into href', () => {
    const parsed = parseWikiLink('[[old-note\\|Shown]]');
    expect(parsed).not.toBeNull();
    expect(parsed?.href).toBe('old-note');
    expect(parsed?.displayText).toBe('Shown');

    const links = findAllWikiLinks('| Ref |\n| --- |\n| [[old-note\\|Shown]] |');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('old-note');
    expect(links[0].displayText).toBe('Shown');
  });

  it('TBL-E05 preserves escaped separator in exact markdown when href changes', () => {
    const initial = '| Ref |\n| --- |\n| [[old-note\\|Shown]] |';
    const actual = rewriteFirstWikiLinkHref(initial, 'new-note', true);

    expect(actual).toBe('| Ref |\n| --- |\n| [[new-note\\|Shown]] |');
  });
});
