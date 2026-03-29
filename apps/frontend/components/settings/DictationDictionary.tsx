import { useState } from 'react';
import { useDictationStore } from '@/stores/dictationStore';

export function DictationDictionary() {
  const dictionary = useDictationStore((s) => s.dictionary);
  const addDictionaryWord = useDictationStore((s) => s.addDictionaryWord);
  const removeDictionaryWord = useDictationStore((s) => s.removeDictionaryWord);

  const [newWord, setNewWord] = useState('');

  const handleAdd = async () => {
    const word = newWord.trim();
    if (!word) return;
    if (dictionary.some((w) => w.toLowerCase() === word.toLowerCase())) {
      setNewWord('');
      return;
    }
    await addDictionaryWord(word);
    setNewWord('');
  };

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-1">Dictionary</h3>
      <p className="text-xs text-foreground-muted mb-3">
        Custom words help Whisper recognize names, jargon, and terms specific to your writing.
      </p>

      <form
        className="flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          placeholder="Add a word..."
          className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-foreground-faint focus:outline-none focus:border-[var(--accent-primary)]"
        />
        <button
          type="submit"
          disabled={!newWord.trim()}
          className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-[var(--overlay-10)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </form>

      {dictionary.length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-[30vh] overflow-y-auto">
          {dictionary.map((word) => (
            <span
              key={word}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md text-sm bg-[var(--overlay-10)] border border-border"
            >
              {word}
              <button
                type="button"
                onClick={() => removeDictionaryWord(word)}
                className="text-foreground-muted hover:text-foreground transition-colors rounded hover:bg-[var(--overlay-10)] p-0.5"
                aria-label={`Remove ${word}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
