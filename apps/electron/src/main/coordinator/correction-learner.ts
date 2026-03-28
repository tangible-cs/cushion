function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter((w) => w.length > 0);
}

function findSubstitutions(origWords: string[], editedWords: string[]): [string, string][] {
  const m = origWords.length;
  const n = editedWords.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1].toLowerCase() === editedWords[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const aligned: [string | null, string | null][] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1].toLowerCase() === editedWords[j - 1].toLowerCase()) {
      aligned.unshift([origWords[i - 1], editedWords[j - 1]]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      aligned.unshift([null, editedWords[j - 1]]);
      j--;
    } else {
      aligned.unshift([origWords[i - 1], null]);
      i--;
    }
  }

  const subs: [string, string][] = [];
  for (let k = 0; k < aligned.length - 1; k++) {
    const [origW, editW] = aligned[k];
    const [nextOrigW, nextEditW] = aligned[k + 1];

    if (origW !== null && editW === null && nextOrigW === null && nextEditW !== null) {
      subs.push([origW, nextEditW]);
    }
  }

  return subs;
}

/**
 * Extract corrected words from a user's edits to transcription text.
 * Returns corrected words to add to the custom dictionary.
 */
export function extractCorrections(
  originalText: string,
  editedText: string,
  existingDictionary: string[],
): string[] {
  if (!originalText || !editedText) return [];
  if (originalText === editedText) return [];

  const origWords = tokenize(originalText);
  const editedWords = tokenize(editedText);

  if (origWords.length === 0 || editedWords.length === 0) return [];

  const subs = findSubstitutions(origWords, editedWords);
  if (subs.length > origWords.length * 0.5) return [];

  const dictSet = new Set(existingDictionary.map((w) => w.toLowerCase()));
  const seenCorrections = new Set<string>();
  const results: string[] = [];

  for (const [origWord, correctedWord] of subs) {
    const normalizedCorrected = correctedWord.toLowerCase();

    if (dictSet.has(normalizedCorrected)) continue;
    if (seenCorrections.has(normalizedCorrected)) continue;
    if (origWord.toLowerCase() === normalizedCorrected) continue;
    if (correctedWord.length < 3) continue;

    const dist = editDistance(origWord.toLowerCase(), correctedWord.toLowerCase());
    const maxLen = Math.max(origWord.length, correctedWord.length);
    if (dist / maxLen > 0.65) continue;

    results.push(correctedWord);
    seenCorrections.add(normalizedCorrected);
  }

  return results;
}
