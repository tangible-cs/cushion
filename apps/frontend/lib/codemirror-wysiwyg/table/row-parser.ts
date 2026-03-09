const LEADING_BOUNDARY_PIPE_REGEX = /^\s*\|/;
const TRAILING_BOUNDARY_PIPE_REGEX = /\|\s*$/;

function countRun(text: string, start: number, marker: string): number {
  let count = 0;
  while (start + count < text.length && text[start + count] === marker) {
    count++;
  }
  return count;
}

function hasClosingCodeDelimiter(text: string, start: number, delimiterLength: number): boolean {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }

    if (text[i] === '`') {
      const runLength = countRun(text, i, '`');
      if (runLength === delimiterLength) {
        return true;
      }
      i += runLength;
      continue;
    }

    i++;
  }

  return false;
}

function hasClosingMathDelimiter(text: string, start: number, delimiterLength: number): boolean {
  let i = start;
  let codeDelimiterLength = 0;

  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }

    if (codeDelimiterLength > 0) {
      if (text[i] === '`') {
        const runLength = countRun(text, i, '`');
        if (runLength === codeDelimiterLength) {
          codeDelimiterLength = 0;
          i += runLength;
          continue;
        }
      }

      i++;
      continue;
    }

    if (text[i] === '`') {
      const runLength = countRun(text, i, '`');
      if (hasClosingCodeDelimiter(text, i + runLength, runLength)) {
        codeDelimiterLength = runLength;
      }
      i += runLength;
      continue;
    }

    if (text[i] === '$') {
      const runLength = countRun(text, i, '$');
      if (runLength === delimiterLength) {
        return true;
      }
      i += runLength;
      continue;
    }

    i++;
  }

  return false;
}

/**
 * Parses a markdown table row into trimmed cell values.
 *
 * This keeps escaped pipes (\|) and pipes inside inline code/math literals
 * as part of the cell content instead of splitting on them.
 */
export function parseTableRow(line: string): string[] {
  const normalized = line
    .replace(LEADING_BOUNDARY_PIPE_REGEX, '')
    .replace(TRAILING_BOUNDARY_PIPE_REGEX, '');

  const cells: string[] = [];
  let current = '';
  let i = 0;
  let codeDelimiterLength = 0;
  let mathDelimiterLength = 0;

  while (i < normalized.length) {
    if (normalized[i] === '\\') {
      if (i + 1 < normalized.length) {
        current += normalized[i] + normalized[i + 1];
        i += 2;
        continue;
      }

      current += normalized[i];
      i++;
      continue;
    }

    if (codeDelimiterLength > 0) {
      if (normalized[i] === '`') {
        const runLength = countRun(normalized, i, '`');
        if (runLength === codeDelimiterLength) {
          codeDelimiterLength = 0;
          current += '`'.repeat(runLength);
          i += runLength;
          continue;
        }
      }

      current += normalized[i];
      i++;
      continue;
    }

    if (mathDelimiterLength > 0) {
      if (normalized[i] === '$') {
        const runLength = countRun(normalized, i, '$');
        if (runLength === mathDelimiterLength) {
          mathDelimiterLength = 0;
          current += '$'.repeat(runLength);
          i += runLength;
          continue;
        }
      }

      current += normalized[i];
      i++;
      continue;
    }

    if (normalized[i] === '`') {
      const runLength = countRun(normalized, i, '`');
      if (hasClosingCodeDelimiter(normalized, i + runLength, runLength)) {
        codeDelimiterLength = runLength;
      }
      current += '`'.repeat(runLength);
      i += runLength;
      continue;
    }

    if (normalized[i] === '$') {
      const runLength = countRun(normalized, i, '$');
      if (hasClosingMathDelimiter(normalized, i + runLength, runLength)) {
        mathDelimiterLength = runLength;
      }
      current += '$'.repeat(runLength);
      i += runLength;
      continue;
    }

    if (normalized[i] === '|') {
      cells.push(current.trim());
      current = '';
      i++;
      continue;
    }

    current += normalized[i];
    i++;
  }

  cells.push(current.trim());
  return cells;
}
