import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import type {
  DictationConfig,
  DictationModelInfo,
  DictationModelName,
  DictationServerInfo,
} from '@cushion/types';
import { playStartCue, playStopCue } from '@/utils/dictation-cues';
import { showGlobalToast } from '@/utils/toast-bridge';
import { getLastFocusedEditable, insertTextIntoElement, type FocusTarget } from '@/lib/focus-tracker';

type DictationStatus = 'idle' | 'waiting-for-server' | 'recording' | 'transcribing' | 'post-processing' | 'error';

interface DownloadProgress {
  model: DictationModelName;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  bytesPerSec: number;
}

interface GpuDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
}

interface DictationState {
  status: DictationStatus;
  error: string | null;
  serverStatus: DictationServerInfo['status'];
  models: DictationModelInfo[];
  selectedModel: DictationModelName;
  downloadProgress: DownloadProgress | null;
  settingsLoaded: boolean;
  postProcessing: DictationConfig['postProcessing'];
  dictionary: string[];
  hotkey: string;
  accelerator: 'cpu' | 'gpu';
  gpuAvailable: boolean;
  gpuName: string | null;
  gpuBinaryDownloaded: boolean;
  gpuBinaryDownloading: boolean;
  gpuBinaryDownloadProgress: GpuDownloadProgress | null;
  setClient: (client: CoordinatorClient) => void;
  loadSettings: () => Promise<void>;
  refreshModels: () => Promise<void>;
  downloadModel: (model: DictationModelName) => Promise<void>;
  cancelDownload: () => Promise<void>;
  deleteModel: (model: DictationModelName) => Promise<void>;
  selectModel: (model: DictationModelName) => Promise<void>;
  updatePostProcessing: (partial: Partial<DictationConfig['postProcessing']>) => Promise<void>;
  addDictionaryWord: (word: string) => Promise<void>;
  removeDictionaryWord: (word: string) => Promise<void>;
  updateHotkey: (hotkey: string) => Promise<void>;
  updateAccelerator: (value: 'cpu' | 'gpu') => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  toggleRecording: () => void;
  reset: () => void;
}

let coordinatorClient: CoordinatorClient | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;
let insertTextCallback: ((text: string) => { from: number; to: number } | void) | null = null;
let getNoteContextCallback: (() => string) | null = null;
let onTextInsertedCallback: ((originalText: string, from: number, to: number) => void) | null = null;
let dictationConfig: DictationConfig | null = null;
let recordingFocusTarget: FocusTarget | null = null;
let serverStatusCleanup: (() => void) | null = null;
let downloadProgressCleanup: (() => void) | null = null;
let downloadCompleteCleanup: (() => void) | null = null;
let downloadErrorCleanup: (() => void) | null = null;
let hotkeyPressedCleanup: (() => void) | null = null;
let hotkeyFailedCleanup: (() => void) | null = null;
let gpuDownloadProgressCleanup: (() => void) | null = null;
let gpuDownloadCompleteCleanup: (() => void) | null = null;
let gpuDownloadErrorCleanup: (() => void) | null = null;

export function setInsertTextCallback(cb: ((text: string) => { from: number; to: number } | void) | null) {
  insertTextCallback = cb;
}

export function setGetNoteContextCallback(cb: (() => string) | null) {
  getNoteContextCallback = cb;
}

export function setOnTextInsertedCallback(cb: ((originalText: string, from: number, to: number) => void) | null) {
  onTextInsertedCallback = cb;
}

function cleanupMedia() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  audioChunks = [];
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}

export const useDictationStore = create<DictationState>()(
  subscribeWithSelector((set, get) => ({
    status: 'idle',
    error: null,
    serverStatus: 'stopped',
    models: [],
    selectedModel: 'parakeet-v3',
    downloadProgress: null,
    settingsLoaded: false,
    postProcessing: { enabled: false, provider: 'openai', apiKey: '', model: 'gpt-4o-mini', fillerRemoval: true, stutterCollapse: true, includeNoteContext: true, autoLearnCorrections: true, skipShortTranscriptions: true, shortTextThreshold: 3 } as DictationConfig['postProcessing'],
    dictionary: [],
    hotkey: 'Control+W',
    accelerator: 'cpu',
    gpuAvailable: false,
    gpuName: null,
    gpuBinaryDownloaded: false,
    gpuBinaryDownloading: false,
    gpuBinaryDownloadProgress: null,

    setClient: (client) => {
      coordinatorClient = client;

      if (serverStatusCleanup) serverStatusCleanup();
      serverStatusCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/server-status-changed',
        (data: DictationServerInfo) => {
          set({ serverStatus: data.status });
        },
      );

      if (downloadProgressCleanup) downloadProgressCleanup();
      downloadProgressCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/download-progress',
        (data: DownloadProgress) => {
          set({ downloadProgress: data });
        },
      );

      if (downloadCompleteCleanup) downloadCompleteCleanup();
      downloadCompleteCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/download-complete',
        () => {
          set({ downloadProgress: null });
          get().refreshModels();
        },
      );

      if (downloadErrorCleanup) downloadErrorCleanup();
      downloadErrorCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/download-error',
        () => {
          set({ downloadProgress: null });
        },
      );

      if (hotkeyPressedCleanup) hotkeyPressedCleanup();
      hotkeyPressedCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/hotkey-pressed',
        () => {
          get().toggleRecording();
        },
      );

      if (hotkeyFailedCleanup) hotkeyFailedCleanup();
      hotkeyFailedCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/hotkey-registration-failed',
        (data: { hotkey: string; error: string }) => {
          showGlobalToast({ description: `Hotkey registration failed: ${data.error}`, variant: 'error' });
        },
      );

      if (gpuDownloadProgressCleanup) gpuDownloadProgressCleanup();
      gpuDownloadProgressCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/gpu-binary-download-progress',
        (data: GpuDownloadProgress) => {
          set({ gpuBinaryDownloadProgress: data });
        },
      );

      if (gpuDownloadCompleteCleanup) gpuDownloadCompleteCleanup();
      gpuDownloadCompleteCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/gpu-binary-download-complete',
        () => {
          set({ gpuBinaryDownloading: false, gpuBinaryDownloaded: true, gpuBinaryDownloadProgress: null });
        },
      );

      if (gpuDownloadErrorCleanup) gpuDownloadErrorCleanup();
      gpuDownloadErrorCleanup = window.electronAPI!.onCoordinatorNotification(
        'dictation/gpu-binary-download-error',
        (data: { error: string }) => {
          set({ gpuBinaryDownloading: false, gpuBinaryDownloadProgress: null });
          showGlobalToast({ description: `GPU binary download failed: ${data.error}`, variant: 'error' });
        },
      );

      client.call('dictation/server-status').then((info) => {
        set({ serverStatus: info.status });
      }).catch(() => {});

      client.call('dictation/dictation-config-read').then((config) => {
        dictationConfig = config;
        set({
          selectedModel: config.selectedModel,
          postProcessing: config.postProcessing,
          dictionary: config.dictionary,
          hotkey: config.hotkey || 'Control+W',
        });
      }).catch(() => {});
    },

    loadSettings: async () => {
      const client = coordinatorClient;
      if (!client) return;

      const [modelsResult, config, gpuAvailableResult, gpuBinaryResult] = await Promise.all([
        client.call('dictation/list-models'),
        client.call('dictation/dictation-config-read'),
        client.call('dictation/is-gpu-available'),
        client.call('dictation/gpu-binary-status'),
      ]);

      dictationConfig = config;
      set({
        models: modelsResult.models,
        selectedModel: config.selectedModel,
        postProcessing: config.postProcessing,
        dictionary: config.dictionary,
        hotkey: config.hotkey || 'Control+W',
        accelerator: config.accelerator || 'cpu',
        gpuAvailable: gpuAvailableResult.available,
        gpuName: gpuAvailableResult.gpuName,
        gpuBinaryDownloaded: gpuBinaryResult.available,
        settingsLoaded: true,
      });
    },

    refreshModels: async () => {
      const client = coordinatorClient;
      if (!client) return;
      const result = await client.call('dictation/list-models');
      set({ models: result.models });
    },

    downloadModel: async (model) => {
      const client = coordinatorClient;
      if (!client) return;
      set({ downloadProgress: { model, percent: 0, downloadedBytes: 0, totalBytes: 0, bytesPerSec: 0 } });
      await client.call('dictation/download-model', { model });
    },

    cancelDownload: async () => {
      const client = coordinatorClient;
      if (!client) return;
      await client.call('dictation/cancel-download');
      set({ downloadProgress: null });
    },

    deleteModel: async (model) => {
      const client = coordinatorClient;
      if (!client) return;
      await client.call('dictation/delete-model', { model });
      await get().refreshModels();

      if (get().selectedModel === model) {
        const downloaded = get().models.find((m) => m.downloaded);
        const fallback = downloaded ? downloaded.name : 'parakeet-v3';
        await get().selectModel(fallback);
      }
    },

    selectModel: async (model) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;
      dictationConfig = { ...dictationConfig, selectedModel: model };
      set({ selectedModel: model });
      await client.call('dictation/dictation-config-write', { config: dictationConfig });
    },

    updatePostProcessing: async (partial) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;
      const updated = { ...dictationConfig.postProcessing, ...partial };
      dictationConfig = { ...dictationConfig, postProcessing: updated };
      set({ postProcessing: updated });
      await client.call('dictation/dictation-config-write', { config: dictationConfig });
    },

    addDictionaryWord: async (word) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;
      const result = await client.call('dictation/dictionary-add', { words: [word] });
      dictationConfig = { ...dictationConfig, dictionary: result.dictionary };
      set({ dictionary: result.dictionary });
    },

    removeDictionaryWord: async (word) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;
      const result = await client.call('dictation/dictionary-remove', { word });
      dictationConfig = { ...dictationConfig, dictionary: result.dictionary };
      set({ dictionary: result.dictionary });
    },

    updateHotkey: async (hotkey) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;
      dictationConfig = { ...dictationConfig, hotkey };
      set({ hotkey });
      await client.call('dictation/update-hotkey', { hotkey });
    },

    updateAccelerator: async (value) => {
      const client = coordinatorClient;
      if (!client || !dictationConfig) return;

      if (value === 'gpu' && !get().gpuBinaryDownloaded) {
        set({ gpuBinaryDownloading: true, gpuBinaryDownloadProgress: { percent: 0, downloadedBytes: 0, totalBytes: 0 } });
        try {
          await client.call('dictation/ensure-gpu-binary');
          set({ gpuBinaryDownloading: false, gpuBinaryDownloaded: true, gpuBinaryDownloadProgress: null });
        } catch {
          set({ gpuBinaryDownloading: false, gpuBinaryDownloadProgress: null });
          return;
        }
      }

      dictationConfig = { ...dictationConfig, accelerator: value };
      set({ accelerator: value });
      await client.call('dictation/dictation-config-write', { config: dictationConfig });

      if (get().serverStatus === 'running') {
        await client.call('dictation/stop-server');
        await client.call('dictation/start-server', { model: get().selectedModel });
      }
    },

    startRecording: async () => {
      const client = coordinatorClient;
      if (!client) return;

      recordingFocusTarget = getLastFocusedEditable();

      const { serverStatus, selectedModel } = get();

      if (serverStatus !== 'running') {
        set({ status: 'waiting-for-server', error: null });

        try {
          await client.call('dictation/ensure-binary');
        } catch {
          set({ status: 'error', error: 'Dictation binary not available' });
          showGlobalToast({ description: 'Dictation binary not available', variant: 'error' });
          return;
        }

        try {
          await client.call('dictation/start-server', { model: selectedModel });
        } catch {
          set({ status: 'error', error: 'Failed to start dictation server' });
          showGlobalToast({ description: 'Failed to start dictation server', variant: 'error' });
          return;
        }

        const running = await new Promise<boolean>((resolve) => {
          if (get().serverStatus === 'running') {
            resolve(true);
            return;
          }
          const timeout = setTimeout(() => { unsub(); resolve(false); }, 60000);
          const unsub = useDictationStore.subscribe(
            (s) => s.serverStatus,
            (status) => {
              if (status === 'running') { clearTimeout(timeout); unsub(); resolve(true); }
              else if (status === 'error') { clearTimeout(timeout); unsub(); resolve(false); }
            },
          );
        });

        if (!running) {
          set({ status: 'error', error: 'Dictation server failed to start' });
          showGlobalToast({ description: 'Dictation server failed to start', variant: 'error' });
          return;
        }
      }

      if (get().status !== 'idle' && get().status !== 'waiting-for-server') return;

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch (err: unknown) {
        const name = err instanceof DOMException ? err.name : '';
        let message = 'Microphone access failed';
        if (name === 'NotAllowedError') message = 'Microphone permission denied';
        else if (name === 'NotFoundError') message = 'No microphone found';
        else if (name === 'NotReadableError') message = 'Microphone is in use';
        set({ status: 'error', error: message });
        showGlobalToast({ description: message, variant: 'error' });
        return;
      }

      audioChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        set({ status: 'transcribing' });

        const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
        cleanupMedia();

        if (!coordinatorClient) {
          set({ status: 'error', error: 'Client disconnected' });
          return;
        }

        try {
          const arrayBuffer = await blob.arrayBuffer();
          const result = await coordinatorClient.call('dictation/transcribe', {
            audioBuffer: arrayBuffer,
          });
          const rawText = result.text?.trim();

          if (!rawText) {
            set({ status: 'idle', error: null });
            showGlobalToast({ description: 'No speech detected', variant: 'default' });
            return;
          }

          const target = recordingFocusTarget;
          const isCodeMirror = !target || target.type === 'codemirror';

          set({ status: 'post-processing' });
          try {
            let noteContext: string | undefined;
            if (isCodeMirror && dictationConfig?.postProcessing?.includeNoteContext && getNoteContextCallback) {
              try { noteContext = getNoteContextCallback() || undefined; } catch {}
            }
            const processed = await coordinatorClient.call('dictation/post-process', { text: rawText, language: result.language, noteContext });
            const finalText = processed.text?.trim();

            if (finalText) {
              if (isCodeMirror && insertTextCallback) {
                const range = insertTextCallback(finalText);
                if (range && get().postProcessing.autoLearnCorrections && onTextInsertedCallback) {
                  onTextInsertedCallback(finalText, range.from, range.to);
                }
              } else if (target && !isCodeMirror) {
                insertTextIntoElement(target, finalText);
              }
            }
          } catch {
            const fallbackText = rawText;
            if (isCodeMirror && insertTextCallback) {
              const range = insertTextCallback(fallbackText);
              if (range && get().postProcessing.autoLearnCorrections && onTextInsertedCallback) {
                onTextInsertedCallback(fallbackText, range.from, range.to);
              }
            } else if (target && !isCodeMirror) {
              insertTextIntoElement(target, fallbackText);
            }
          }

          set({ status: 'idle', error: null });
        } catch (err) {
          console.error('[Dictation] Transcription failed:', err);
          set({ status: 'error', error: 'Transcription failed' });
          showGlobalToast({ description: 'Transcription failed', variant: 'error' });
        }
      };

      mediaRecorder.start();
      set({ status: 'recording', error: null });
      playStartCue();
    },

    stopRecording: () => {
      playStopCue();
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    },

    toggleRecording: () => {
      const { status, startRecording, stopRecording } = get();
      if (status === 'idle' || status === 'error') {
        startRecording();
      } else if (status === 'recording') {
        stopRecording();
      }
    },

    reset: () => {
      cleanupMedia();
      set({ status: 'idle', error: null });
    },
  })),
);
