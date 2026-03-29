import type { SherpaModelManager } from '../sherpa-model-manager';
import type { SherpaManager } from '../sherpa-manager';
import type { SherpaBinaryManager } from '../sherpa-binary-manager';
import type { DictationConfigManager } from '../dictation-config';
import type { PostProcessor } from '../post-processor';
import type { HotkeyManager } from '../hotkey-manager';
import type { DictationModelName, DictationConfig } from '@cushion/types';
import { extractCorrections } from '../correction-learner';

export async function handleDictationListModels(modelManager: SherpaModelManager) {
  return { models: await modelManager.listAllModels() };
}

export async function handleDictationDownloadModel(
  modelManager: SherpaModelManager,
  params: { model: DictationModelName },
) {
  return modelManager.downloadModel(params.model);
}

export function handleDictationCancelDownload(modelManager: SherpaModelManager) {
  return modelManager.cancelDownload();
}

export async function handleDictationDeleteModel(
  modelManager: SherpaModelManager,
  params: { model: DictationModelName },
) {
  return modelManager.deleteModel(params.model);
}

export async function handleDictationStartServer(
  sherpaManager: SherpaManager,
  modelManager: SherpaModelManager,
  dictationConfig: DictationConfigManager,
  params: { model: DictationModelName; language?: string },
) {
  if (!modelManager.isModelDownloaded(params.model)) {
    throw new Error(`Model "${params.model}" is not downloaded`);
  }
  const config = await dictationConfig.read();
  const accelerator = config.accelerator || 'cpu';
  const modelDir = modelManager.getModelDir(params.model);
  await sherpaManager.start(params.model, modelDir, params.language, accelerator);
  return { success: true };
}

export async function handleDictationStopServer(sherpaManager: SherpaManager) {
  await sherpaManager.stop();
  return { success: true };
}

export function handleDictationServerStatus(sherpaManager: SherpaManager) {
  return sherpaManager.getStatus();
}

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export async function handleDictationTranscribe(
  sherpaManager: SherpaManager,
  params: { audioBuffer: ArrayBuffer },
) {
  if (params.audioBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(`Audio buffer too large: ${Math.round(params.audioBuffer.byteLength / 1024 / 1024)}MB (max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)`);
  }
  const buffer = Buffer.from(params.audioBuffer);
  return sherpaManager.transcribe(buffer);
}

export async function handleDictationEnsureBinary(binaryManager: SherpaBinaryManager) {
  return binaryManager.ensureBinary();
}

export function handleDictationBinaryStatus(binaryManager: SherpaBinaryManager) {
  return binaryManager.isBinaryAvailable();
}

export async function handleDictationPostProcess(
  postProcessor: PostProcessor,
  params: { text: string; language?: string; noteContext?: string },
) {
  return postProcessor.process(params.text, params.language, params.noteContext);
}

export async function handleDictationConfigRead(dictationConfig: DictationConfigManager) {
  return dictationConfig.read();
}

export async function handleDictationConfigWrite(
  dictationConfig: DictationConfigManager,
  params: { config: DictationConfig },
) {
  await dictationConfig.write(params.config);
  return { success: true };
}

export async function handleDictationDictionaryAdd(
  dictationConfig: DictationConfigManager,
  params: { words: string[] },
) {
  return { dictionary: await dictationConfig.addDictionaryWords(params.words) };
}

export async function handleDictationDictionaryRemove(
  dictationConfig: DictationConfigManager,
  params: { word: string },
) {
  return { dictionary: await dictationConfig.removeDictionaryWord(params.word) };
}

export async function handleDictationLearnCorrection(
  dictationConfig: DictationConfigManager,
  params: { original: string; edited: string },
) {
  const dictionary = await dictationConfig.getDictionary();
  const addedWords = extractCorrections(params.original, params.edited, dictionary);
  if (addedWords.length > 0) {
    await dictationConfig.addDictionaryWords(addedWords);
  }
  return { addedWords };
}

export async function handleDictationUpdateHotkey(
  hotkeyManager: HotkeyManager,
  dictationConfig: DictationConfigManager,
  params: { hotkey: string },
) {
  const config = await dictationConfig.read();
  config.hotkey = params.hotkey;
  await dictationConfig.write(config);
  hotkeyManager.register(params.hotkey);
  return { success: true };
}

export function handleDictationIsGpuAvailable(binaryManager: SherpaBinaryManager) {
  return { available: binaryManager.isGpuSupported(), gpuName: binaryManager.getGpuName() };
}

export function handleDictationGpuBinaryStatus(binaryManager: SherpaBinaryManager) {
  return binaryManager.isGpuBinaryAvailable();
}

export async function handleDictationEnsureGpuBinary(binaryManager: SherpaBinaryManager) {
  return binaryManager.ensureGpuBinary();
}
