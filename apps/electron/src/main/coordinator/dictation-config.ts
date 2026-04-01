import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import type { DictationConfig, DictationModelName } from '@cushion/types';

const CONFIG_FILE = 'dictation.json';

const DEFAULT_CONFIG: DictationConfig = {
  enabled: false,
  selectedModel: 'parakeet-v3',
  hotkey: 'Control+D',
  postProcessing: {
    enabled: false,
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    fillerRemoval: true,
    stutterCollapse: true,
    includeNoteContext: true,
    autoLearnCorrections: true,
    fuzzyCorrection: true,
    dictionaryInPrompt: true,
    skipShortTranscriptions: true,
    shortTextThreshold: 3,
  },
  dictionary: [],
  accelerator: 'cpu',
};

function migrateWhisperModel(name: string): DictationModelName {
  switch (name) {
    case 'tiny': return 'whisper-small';
    case 'base': return 'whisper-small';
    case 'small': return 'whisper-small';
    case 'medium': return 'whisper-medium';
    case 'turbo': return 'whisper-turbo';
    case 'large': return 'whisper-large-v3';
    default: return 'parakeet-v3';
  }
}

function migrateConfig(raw: Record<string, unknown>): DictationConfig {
  // Already migrated — no legacy selectedEngine field present
  if (raw.selectedModel && typeof raw.selectedModel === 'string' && !raw.selectedEngine) {
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      selectedModel: raw.selectedModel as DictationModelName,
      postProcessing: { ...DEFAULT_CONFIG.postProcessing, ...(raw.postProcessing as object) },
    };
  }

  // Legacy format: selectedEngine + selectedModel (WhisperModelName) + selectedSherpaModel
  const engine = raw.selectedEngine as string | undefined;
  const whisperModel = raw.selectedModel as string | undefined;
  const sherpaModel = raw.selectedSherpaModel as string | undefined;

  let selectedModel: DictationModelName;
  if (engine === 'sherpa' && sherpaModel) {
    selectedModel = sherpaModel as DictationModelName;
  } else {
    selectedModel = migrateWhisperModel(whisperModel || 'base');
  }

  return {
    enabled: true,
    selectedModel,
    hotkey: (raw.hotkey as string) || DEFAULT_CONFIG.hotkey,
    postProcessing: { ...DEFAULT_CONFIG.postProcessing, ...(raw.postProcessing as object) },
    dictionary: (raw.dictionary as string[]) || DEFAULT_CONFIG.dictionary,
  };
}

export class DictationConfigManager {
  private configPath: string;
  private cache: DictationConfig | null = null;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILE);
  }

  async init(): Promise<void> {
    try {
      await fs.access(this.configPath);
    } catch {
      await fs.writeFile(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    }
  }

  async read(): Promise<DictationConfig> {
    const raw = await fs.readFile(this.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    this.cache = migrateConfig(parsed);

    if (parsed.selectedEngine !== undefined) {
      await this.write(this.cache);
    }

    return this.cache;
  }

  async write(config: DictationConfig): Promise<void> {
    this.cache = config;
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  async getDictionary(): Promise<string[]> {
    const config = await this.read();
    return config.dictionary;
  }

  async addDictionaryWords(words: string[]): Promise<string[]> {
    const config = await this.read();
    const existing = new Set(config.dictionary.map((w) => w.toLowerCase()));
    for (const word of words) {
      if (!existing.has(word.toLowerCase())) {
        config.dictionary.push(word);
        existing.add(word.toLowerCase());
      }
    }
    await this.write(config);
    return config.dictionary;
  }

  async removeDictionaryWord(word: string): Promise<string[]> {
    const config = await this.read();
    const lower = word.toLowerCase();
    config.dictionary = config.dictionary.filter((w) => w.toLowerCase() !== lower);
    await this.write(config);
    return config.dictionary;
  }
}
