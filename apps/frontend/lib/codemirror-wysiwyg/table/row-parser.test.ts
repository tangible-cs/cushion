import { describe, expect, it } from 'vitest';

import { TableWidget } from '../widgets/table-widget';
import { parseTableRow } from './row-parser';

const escapeAwareCases = [
  {
    id: 'TBL-E01',
    row: '| Alpha | [[target\\|Alias]] |',
    expected: ['Alpha', '[[target\\|Alias]]'],
  },
  {
    id: 'TBL-E02',
    row: '| ![[hero.png\\|320]] | ready |',
    expected: ['![[hero.png\\|320]]', 'ready'],
  },
  {
    id: 'TBL-E06',
    row: '| `a | b` | code |',
    expected: ['`a | b`', 'code'],
  },
  {
    id: 'TBL-E07',
    row: '| $|x|$ | abs |',
    expected: ['$|x|$', 'abs'],
  },
] as const;

describe('parseTableRow', () => {
  for (const testCase of escapeAwareCases) {
    it(`${testCase.id} parses without splitting escaped or inline content pipes`, () => {
      expect(parseTableRow(testCase.row)).toEqual(testCase.expected);
    });
  }
});

describe('TableWidget row parsing', () => {
  for (const testCase of escapeAwareCases) {
    it(`${testCase.id} keeps widget columns stable`, () => {
      const rawText = `| Left | Right |\n| --- | --- |\n${testCase.row}`;
      const table = new TableWidget(rawText).toDOM();
      const bodyRow = table.querySelector('tbody tr');

      expect(bodyRow).not.toBeNull();
      expect(bodyRow?.children.length).toBe(2);
      expect(bodyRow?.children[0]?.textContent).toBe(testCase.expected[0]);
      expect(bodyRow?.children[1]?.textContent).toBe(testCase.expected[1]);
    });
  }
});
