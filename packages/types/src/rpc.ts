import type {
  FileTreeNode,
  FileChange,
} from './index.js';

export interface TrashItem {
  id: string;
  originalPath: string;
  deletedAt: string;
  isDirectory: boolean;
}

export type DictationModelName =
  | 'whisper-tiny'
  | 'whisper-base'
  | 'whisper-small'
  | 'whisper-medium'
  | 'whisper-turbo'
  | 'whisper-large-v3'
  | 'parakeet-v2'
  | 'parakeet-v3'
  | 'moonshine-base'
  | 'moonshine-v2-tiny'
  | 'moonshine-v2-small'
  | 'moonshine-v2-medium'
  | 'sensevoice'
  | 'gigaam-v3';

export type DictationEngineType = 'whisper' | 'transducer' | 'moonshine-v1' | 'moonshine-v2' | 'sensevoice' | 'nemo-ctc';

export type DictationModelCategory = 'Whisper' | 'Parakeet' | 'Moonshine' | 'SenseVoice' | 'GigaAM';

export interface DictationModelInfo {
  name: DictationModelName;
  label: string;
  engineType: DictationEngineType;
  sizeMb: number;
  languages: string[];
  downloaded: boolean;
  category: DictationModelCategory;
  description: string;
  speedScore: number;
  accuracyScore: number;
  isRecommended: boolean;
}

export type DictationServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface DictationServerInfo {
  status: DictationServerStatus;
  port: number | null;
  modelName: DictationModelName | null;
}

export interface DictationConfig {
  selectedModel: DictationModelName;
  hotkey: string;
  postProcessing: {
    enabled: boolean;
    provider: 'openai' | 'ollama';
    apiKey?: string;
    baseUrl?: string;
    model: string;
    fillerRemoval: boolean;
    stutterCollapse: boolean;
    includeNoteContext?: boolean;
    autoLearnCorrections: boolean;
    skipShortTranscriptions: boolean;
    shortTextThreshold: number;
  };
  dictionary: string[];
}

export interface TranscriptionResult {
  text: string;
  language: string;
}

export interface RPCMethodMap {
  // Workspace
  'workspace/open': {
    params: { projectPath: string };
    result: { projectName: string; gitRoot: string | null };
  };
  'workspace/select-folder': {
    params: void;
    result: { path: string | null };
  };
  'workspace/files': {
    params: { relativePath?: string };
    result: { files: FileTreeNode[] };
  };
  'workspace/allFiles': {
    params: void;
    result: { paths: string[] };
  };
  'workspace/file': {
    params: { filePath: string };
    result: { content: string; encoding: string; lineEnding: string };
  };
  'workspace/save-file': {
    params: {
      filePath: string;
      content: string;
      encoding?: string;
      lineEnding?: 'LF' | 'CRLF';
    };
    result: { success: boolean };
  };
  'workspace/rename': {
    params: { oldPath: string; newPath: string };
    result: { success: boolean };
  };
  'workspace/delete': {
    params: { path: string };
    result: { success: boolean; trashItem?: TrashItem };
  };
  'workspace/duplicate': {
    params: { path: string; newPath: string };
    result: { success: boolean };
  };
  'workspace/create-folder': {
    params: { path: string };
    result: { success: boolean };
  };
  'workspace/file-base64': {
    params: { filePath: string };
    result: { base64: string; mimeType: string };
  };
  'workspace/file-base64-chunk': {
    params: { filePath: string; offset: number; length: number };
    result: {
      base64: string;
      mimeType: string;
      offset: number;
      bytesRead: number;
      totalBytes: number;
    };
  };
  'workspace/save-file-base64': {
    params: { filePath: string; base64: string };
    result: { success: boolean };
  };

  // Trash
  'trash/restore': {
    params: { ids: string[] };
    result: { success: boolean; restoredPaths: string[] };
  };
  'trash/list': {
    params: void;
    result: { items: TrashItem[] };
  };
  'trash/permanent-delete': {
    params: { ids: string[] };
    result: { success: boolean };
  };
  'trash/empty': {
    params: void;
    result: { success: boolean };
  };

  // Skills
  'skill/install-zip': {
    params: { skillName: string; files: Array<{ path: string; content: string }> };
    result: { success: boolean };
  };

  // Shell (scoped to setup commands)
  'shell/exec': {
    params: { command: string; args: string[] };
    result: { stdout: string; stderr: string; exitCode: number };
  };
  'shell/login-start': {
    params: void;
    result: { started: boolean };
  };
  'shell/login-finish': {
    params: void;
    result: { finished: boolean };
  };

  // Config
  'config/read': {
    params: { file: string };
    result: { content: string | null; exists: boolean };
  };
  'config/write': {
    params: { file: string; content: string };
    result: { success: boolean };
  };

  // Dictation
  'dictation/list-models': {
    params: void;
    result: { models: DictationModelInfo[] };
  };
  'dictation/download-model': {
    params: { model: DictationModelName };
    result: { success: boolean };
  };
  'dictation/cancel-download': {
    params: void;
    result: { cancelled: boolean };
  };
  'dictation/delete-model': {
    params: { model: DictationModelName };
    result: { success: boolean };
  };
  'dictation/start-server': {
    params: { model: DictationModelName; language?: string };
    result: { success: boolean };
  };
  'dictation/stop-server': {
    params: void;
    result: { success: boolean };
  };
  'dictation/server-status': {
    params: void;
    result: DictationServerInfo;
  };
  'dictation/transcribe': {
    params: { audioBuffer: ArrayBuffer };
    result: TranscriptionResult;
  };
  'dictation/ensure-binary': {
    params: void;
    result: { path: string };
  };
  'dictation/binary-status': {
    params: void;
    result: { available: boolean; path: string | null };
  };
  'dictation/post-process': {
    params: { text: string; language?: string; noteContext?: string };
    result: { text: string; wasProcessed: boolean };
  };
  'dictation/dictation-config-read': {
    params: void;
    result: DictationConfig;
  };
  'dictation/dictation-config-write': {
    params: { config: DictationConfig };
    result: { success: boolean };
  };
  'dictation/dictionary-add': {
    params: { words: string[] };
    result: { dictionary: string[] };
  };
  'dictation/dictionary-remove': {
    params: { word: string };
    result: { dictionary: string[] };
  };
  'dictation/learn-correction': {
    params: { original: string; edited: string };
    result: { addedWords: string[] };
  };
  'dictation/update-hotkey': {
    params: { hotkey: string };
    result: { success: boolean };
  };
}

export interface RPCServerNotificationMap {
  'workspace/filesChanged': { changes: FileChange[] };
  'workspace/fileChangedOnDisk': { filePath: string; mtime: number };
  'config/changed': { file: string };

  'dictation/download-progress': {
    model: DictationModelName;
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
    bytesPerSec: number;
  };
  'dictation/download-complete': {
    model: DictationModelName;
  };
  'dictation/download-error': {
    model: DictationModelName;
    error: string;
  };
  'dictation/server-status-changed': DictationServerInfo;
  'dictation/binary-download-progress': {
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
  };
  'dictation/binary-download-complete': { path: string };
  'dictation/binary-download-error': { error: string };
  'dictation/hotkey-pressed': {};
  'dictation/hotkey-registration-failed': { hotkey: string; error: string };
}

export type RPCMethodName = keyof RPCMethodMap;
export type RPCParams<M extends RPCMethodName> = RPCMethodMap[M]['params'];
export type RPCResult<M extends RPCMethodName> = RPCMethodMap[M]['result'];

export type RPCServerNotificationName = keyof RPCServerNotificationMap;
export type RPCServerNotificationParams<M extends RPCServerNotificationName> =
  RPCServerNotificationMap[M];

