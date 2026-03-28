const FILLER_MAPS: Record<string, string[]> = {
  en: ['uh', 'um', 'uhm', 'umm', 'uhh', 'uhhh', 'ah', 'hmm', 'hm', 'mmm', 'mm', 'mh', 'eh', 'ehh', 'ha'],
  es: ['ehm', 'mmm', 'hmm', 'hm'],
  pt: ['ahm', 'hmm', 'mmm', 'hm'],
  fr: ['euh', 'hmm', 'hm', 'mmm'],
  de: ['äh', 'ähm', 'hmm', 'hm', 'mmm'],
  it: ['ehm', 'hmm', 'mmm', 'hm'],
  cs: ['ehm', 'hmm', 'mmm', 'hm'],
  pl: ['hmm', 'mmm', 'hm'],
  tr: ['hmm', 'mmm', 'hm'],
  ru: ['хм', 'ммм', 'hmm', 'mmm'],
  uk: ['хм', 'ммм', 'hmm', 'mmm'],
  ar: ['hmm', 'mmm'],
  ja: ['hmm', 'mmm'],
  ko: ['hmm', 'mmm'],
  vi: ['hmm', 'mmm', 'hm'],
  zh: ['hmm', 'mmm'],
  // Conservative fallback: excludes "um" (Portuguese "a/an") and "ha" (Spanish verb)
  fallback: ['uh', 'uhm', 'umm', 'uhh', 'uhhh', 'ah', 'hmm', 'hm', 'mmm', 'mm', 'mh', 'ehh'],
};

function getFillers(language?: string): string[] {
  const code = language?.slice(0, 2).toLowerCase();
  if (code && FILLER_MAPS[code]) return FILLER_MAPS[code];
  return FILLER_MAPS.fallback;
}

export function removeFillers(text: string, language?: string): string {
  const fillers = getFillers(language);
  const pattern = new RegExp(`\\b(${fillers.join('|')})\\b[,.]?\\s*`, 'gi');
  let result = text.replace(pattern, ' ');
  result = result.replace(/^\s*[,.]\s*/, '');
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}

export function collapseStutters(text: string): string {
  const words = text.split(/\s+/);
  if (words.length === 0) return text;

  const result: string[] = [words[0]];
  let repeatCount = 1;

  for (let i = 1; i < words.length; i++) {
    const current = words[i];
    const prev = words[i - 1];

    if (current.toLowerCase() === prev.toLowerCase() && current.length <= 2) {
      repeatCount++;
      if (repeatCount < 3) {
        result.push(current);
      }
    } else {
      if (repeatCount >= 3) {
        while (
          result.length > 1 &&
          result[result.length - 1].toLowerCase() === result[result.length - 2]?.toLowerCase() &&
          result[result.length - 1].length <= 2
        ) {
          result.pop();
        }
      }
      repeatCount = 1;
      result.push(current);
    }
  }

  if (repeatCount >= 3) {
    while (
      result.length > 1 &&
      result[result.length - 1].toLowerCase() === result[result.length - 2]?.toLowerCase() &&
      result[result.length - 1].length <= 2
    ) {
      result.pop();
    }
  }

  return result.join(' ');
}

interface TextCleanupOptions {
  fillerRemoval: boolean;
  stutterCollapse: boolean;
  language?: string;
}

export function applyTextCleanup(text: string, options: TextCleanupOptions): string {
  let result = text;

  if (options.fillerRemoval) {
    result = removeFillers(result, options.language);
  }

  if (options.stutterCollapse) {
    result = collapseStutters(result);
  }

  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}
