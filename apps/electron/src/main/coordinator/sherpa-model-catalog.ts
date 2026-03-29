import type { DictationModelName, DictationEngineType, DictationModelCategory } from '@cushion/types';

const GITHUB_BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models';

export interface SherpaModelEntry {
  label: string;
  description: string;
  engineType: DictationEngineType;
  sizeMb: number;
  languages: string[];
  downloadUrl: string;
  extractDir: string;
  requiredFiles: string[];
  category: DictationModelCategory;
  whisperPrefix?: string;
  speedScore: number;
  accuracyScore: number;
  isRecommended: boolean;
}

export const SHERPA_MODEL_CATALOG: Record<DictationModelName, SherpaModelEntry> = {
  // --- Whisper ONNX models ---
  'whisper-small': {
    label: 'Whisper Small',
    description: 'Solid multilingual accuracy. Recommended starting point.',
    engineType: 'whisper',
    sizeMb: 610,
    languages: ['multi'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-whisper-small.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-small',
    requiredFiles: ['small-encoder.int8.onnx', 'small-decoder.int8.onnx', 'small-tokens.txt'],
    category: 'Whisper',
    whisperPrefix: 'small',
    speedScore: 0.40,
    accuracyScore: 0.70,
    isRecommended: false,
  },
  'whisper-medium': {
    label: 'Whisper Medium',
    description: 'High accuracy, slower. Large download.',
    engineType: 'whisper',
    sizeMb: 1842,
    languages: ['multi'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-whisper-medium.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-medium',
    requiredFiles: ['medium-encoder.int8.onnx', 'medium-decoder.int8.onnx', 'medium-tokens.txt'],
    category: 'Whisper',
    whisperPrefix: 'medium',
    speedScore: 0.20,
    accuracyScore: 0.80,
    isRecommended: false,
  },
  'whisper-turbo': {
    label: 'Whisper Turbo',
    description: 'Balanced accuracy and speed. Best all-rounder.',
    engineType: 'whisper',
    sizeMb: 538,
    languages: ['multi'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-whisper-turbo.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-turbo',
    requiredFiles: ['turbo-encoder.int8.onnx', 'turbo-decoder.int8.onnx', 'turbo-tokens.txt'],
    category: 'Whisper',
    whisperPrefix: 'turbo',
    speedScore: 0.25,
    accuracyScore: 0.78,
    isRecommended: false,
  },
  'whisper-large-v3': {
    label: 'Whisper Large V3',
    description: 'Best accuracy, slowest. For demanding transcription.',
    engineType: 'whisper',
    sizeMb: 1019,
    languages: ['multi'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-whisper-large-v3.tar.bz2`,
    extractDir: 'sherpa-onnx-whisper-large-v3',
    requiredFiles: ['large-v3-encoder.int8.onnx', 'large-v3-decoder.int8.onnx', 'large-v3-tokens.txt'],
    category: 'Whisper',
    whisperPrefix: 'large-v3',
    speedScore: 0.10,
    accuracyScore: 0.85,
    isRecommended: false,
  },

  // --- Parakeet ---
  'parakeet-v2': {
    label: 'Parakeet V2',
    description: 'English only. Fast and accurate.',
    engineType: 'transducer',
    sizeMb: 473,
    languages: ['en'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8',
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
    category: 'Parakeet',
    speedScore: 0.65,
    accuracyScore: 0.90,
    isRecommended: true,
  },
  'parakeet-v3': {
    label: 'Parakeet V3',
    description: 'Best for European languages. 25 language support.',
    engineType: 'transducer',
    sizeMb: 478,
    languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ro', 'cs', 'hu', 'fi', 'sv', 'da', 'no', 'sk', 'sl', 'hr', 'bg', 'lt', 'lv', 'et', 'el', 'uk', 'ca'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
    category: 'Parakeet',
    speedScore: 0.65,
    accuracyScore: 0.85,
    isRecommended: true,
  },

  // --- Moonshine ---
  'moonshine-base': {
    label: 'Moonshine Base',
    description: 'Lightweight English model. Very fast.',
    engineType: 'moonshine-v1',
    sizeMb: 58,
    languages: ['en'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-moonshine-base-en-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-moonshine-base-en-int8',
    requiredFiles: ['preprocess.onnx', 'encode.int8.onnx', 'uncached_decode.int8.onnx', 'cached_decode.int8.onnx', 'tokens.txt'],
    category: 'Moonshine',
    speedScore: 0.80,
    accuracyScore: 0.50,
    isRecommended: false,
  },
  'moonshine-v2-tiny': {
    label: 'Moonshine V2 Tiny',
    description: 'Smallest model available. Ultra-fast English.',
    engineType: 'moonshine-v2',
    sizeMb: 43,
    languages: ['en'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-moonshine-v2-tiny-en-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-moonshine-v2-tiny-en-int8',
    requiredFiles: ['encoder.int8.onnx', 'merged_decoder.int8.onnx', 'tokens.txt'],
    category: 'Moonshine',
    speedScore: 0.95,
    accuracyScore: 0.40,
    isRecommended: false,
  },
  'moonshine-v2-small': {
    label: 'Moonshine V2 Small',
    description: 'Fast English with good accuracy.',
    engineType: 'moonshine-v2',
    sizeMb: 100,
    languages: ['en'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-moonshine-v2-small-en-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-moonshine-v2-small-en-int8',
    requiredFiles: ['encoder.int8.onnx', 'merged_decoder.int8.onnx', 'tokens.txt'],
    category: 'Moonshine',
    speedScore: 0.75,
    accuracyScore: 0.65,
    isRecommended: false,
  },
  'moonshine-v2-medium': {
    label: 'Moonshine V2 Medium',
    description: 'Best Moonshine accuracy. English only.',
    engineType: 'moonshine-v2',
    sizeMb: 192,
    languages: ['en'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-moonshine-v2-medium-en-int8.tar.bz2`,
    extractDir: 'sherpa-onnx-moonshine-v2-medium-en-int8',
    requiredFiles: ['encoder.int8.onnx', 'merged_decoder.int8.onnx', 'tokens.txt'],
    category: 'Moonshine',
    speedScore: 0.60,
    accuracyScore: 0.75,
    isRecommended: false,
  },

  // --- SenseVoice ---
  'sensevoice': {
    label: 'SenseVoice',
    description: 'Optimized for Chinese, English, Japanese, Korean.',
    engineType: 'sensevoice',
    sizeMb: 160,
    languages: ['zh', 'en', 'ja', 'ko', 'yue'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2`,
    extractDir: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    requiredFiles: ['model.int8.onnx', 'tokens.txt'],
    category: 'SenseVoice',
    speedScore: 0.90,
    accuracyScore: 0.60,
    isRecommended: true,
  },

  // --- GigaAM ---
  'gigaam-v3': {
    label: 'GigaAM V3',
    description: 'Russian language specialist.',
    engineType: 'nemo-ctc',
    sizeMb: 152,
    languages: ['ru'],
    downloadUrl: `${GITHUB_BASE}/sherpa-onnx-nemo-ctc-giga-am-russian-2024-10-24.tar.bz2`,
    extractDir: 'sherpa-onnx-nemo-ctc-giga-am-russian-2024-10-24',
    requiredFiles: ['model.int8.onnx', 'tokens.txt'],
    category: 'GigaAM',
    speedScore: 0.70,
    accuracyScore: 0.85,
    isRecommended: false,
  },
};

/**
 * Build CLI args for sherpa-onnx-offline-websocket-server based on engine type.
 */
export function buildSherpaCliArgs(
  modelDir: string,
  port: number,
  numThreads: number,
  entry: SherpaModelEntry,
  language?: string,
): string[] {
  const p = (file: string) => `${modelDir}/${file}`;
  const common = [`--port=${port}`, `--num-threads=${numThreads}`];

  switch (entry.engineType) {
    case 'whisper': {
      const prefix = entry.whisperPrefix!;
      const args = [
        `--whisper-encoder=${p(`${prefix}-encoder.int8.onnx`)}`,
        `--whisper-decoder=${p(`${prefix}-decoder.int8.onnx`)}`,
        `--tokens=${p(`${prefix}-tokens.txt`)}`,
        `--whisper-task=transcribe`,
        ...common,
      ];
      if (language) args.push(`--whisper-language=${language}`);
      return args;
    }
    case 'transducer':
      return [
        `--encoder=${p('encoder.int8.onnx')}`,
        `--decoder=${p('decoder.int8.onnx')}`,
        `--joiner=${p('joiner.int8.onnx')}`,
        `--tokens=${p('tokens.txt')}`,
        ...common,
      ];
    case 'moonshine-v1':
      return [
        `--moonshine-preprocessor=${p('preprocess.onnx')}`,
        `--moonshine-encoder=${p('encode.int8.onnx')}`,
        `--moonshine-uncached-decoder=${p('uncached_decode.int8.onnx')}`,
        `--moonshine-cached-decoder=${p('cached_decode.int8.onnx')}`,
        `--tokens=${p('tokens.txt')}`,
        ...common,
      ];
    case 'moonshine-v2':
      return [
        `--moonshine-encoder=${p('encoder.int8.onnx')}`,
        `--moonshine-merged-decoder=${p('merged_decoder.int8.onnx')}`,
        `--tokens=${p('tokens.txt')}`,
        ...common,
      ];
    case 'sensevoice':
      return [
        `--sense-voice-model=${p('model.int8.onnx')}`,
        `--sense-voice-language=auto`,
        `--sense-voice-use-itn=true`,
        `--tokens=${p('tokens.txt')}`,
        ...common,
      ];
    case 'nemo-ctc':
      return [
        `--nemo-ctc-model=${p('model.int8.onnx')}`,
        `--tokens=${p('tokens.txt')}`,
        ...common,
      ];
  }
}
