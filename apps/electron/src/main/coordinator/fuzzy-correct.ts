import { editDistance } from './correction-learner';

function soundex(word: string): string {
  const upper = word.toUpperCase();
  if (!upper.length) return '0000';

  const map: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let code = upper[0];
  let prev = map[upper[0]] || '0';

  for (let i = 1; i < upper.length && code.length < 4; i++) {
    const c = upper[i];
    const mapped = map[c];
    if (mapped && mapped !== prev) {
      code += mapped;
    }
    prev = mapped || '0';
  }

  return code.padEnd(4, '0');
}

function buildNgram(words: string[]): string {
  return words
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .join('');
}

function extractPunctuation(word: string): { prefix: string; suffix: string } {
  const prefixMatch = word.match(/^[^a-zA-Z0-9]*/);
  const suffixMatch = word.match(/[^a-zA-Z0-9]*$/);
  return {
    prefix: prefixMatch ? prefixMatch[0] : '',
    suffix: suffixMatch ? suffixMatch[0] : '',
  };
}

function preserveCase(original: string, replacement: string): string {
  if (original.split('').every((c) => c === c.toUpperCase() && c !== c.toLowerCase())) {
    return replacement.toUpperCase();
  }
  if (original[0] && original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function findBestMatch(
  candidate: string,
  dictionary: string[],
  dictNoSpace: string[],
  threshold: number,
): { replacement: string; score: number } | null {
  if (!candidate || candidate.length > 50) return null;

  let bestMatch: string | null = null;
  let bestScore = Infinity;

  for (let i = 0; i < dictNoSpace.length; i++) {
    const cw = dictNoSpace[i];

    const lenDiff = Math.abs(candidate.length - cw.length);
    const maxLen = Math.max(candidate.length, cw.length);
    const maxAllowedDiff = Math.max(maxLen * 0.25, 2);
    if (lenDiff > maxAllowedDiff) continue;

    const dist = editDistance(candidate, cw);
    const levScore = maxLen > 0 ? dist / maxLen : 1;

    const phoneticMatch = soundex(candidate) === soundex(cw);
    const combinedScore = phoneticMatch ? levScore * 0.3 : levScore;

    if (combinedScore < threshold && combinedScore < bestScore) {
      bestMatch = dictionary[i];
      bestScore = combinedScore;
    }
  }

  return bestMatch ? { replacement: bestMatch, score: bestScore } : null;
}

export function applyFuzzyCorrection(
  text: string,
  dictionary: string[],
  threshold = 0.18,
): string {
  if (dictionary.length === 0) return text;

  const dictLower = dictionary.map((w) => w.toLowerCase());
  const dictNoSpace = dictLower.map((w) => w.replace(/ /g, ''));

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    let matched = false;

    for (let n = 3; n >= 1; n--) {
      if (i + n > words.length) continue;

      const ngramWords = words.slice(i, i + n);
      const ngram = buildNgram(ngramWords);

      const match = findBestMatch(ngram, dictionary, dictNoSpace, threshold);
      if (match) {
        const { prefix } = extractPunctuation(ngramWords[0]);
        const { suffix } = extractPunctuation(ngramWords[n - 1]);
        const corrected = preserveCase(ngramWords[0], match.replacement);
        result.push(`${prefix}${corrected}${suffix}`);
        i += n;
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.push(words[i]);
      i += 1;
    }
  }

  return result.join(' ');
}
