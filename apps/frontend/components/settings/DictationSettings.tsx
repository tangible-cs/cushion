import { useEffect, useState } from 'react';
import { useDictationStore } from '@/stores/dictationStore';
import { DictationModelDialog } from './DictationModelPicker';
import { DictationPostProcessing } from './DictationPostProcessing';
import { DictationDictionary } from './DictationDictionary';
import { ToggleRow } from './FilesSettings';
import { cn } from '@/lib/utils';

export function DictationSettings() {
  const loadSettings = useDictationStore((s) => s.loadSettings);
  const serverStatus = useDictationStore((s) => s.serverStatus);
  const selectedModel = useDictationStore((s) => s.selectedModel);
  const models = useDictationStore((s) => s.models);
  const status = useDictationStore((s) => s.status);
  const accelerator = useDictationStore((s) => s.accelerator);
  const gpuAvailable = useDictationStore((s) => s.gpuAvailable);
  const gpuName = useDictationStore((s) => s.gpuName);
  const gpuBinaryDownloading = useDictationStore((s) => s.gpuBinaryDownloading);
  const gpuBinaryDownloadProgress = useDictationStore((s) => s.gpuBinaryDownloadProgress);
  const updateAccelerator = useDictationStore((s) => s.updateAccelerator);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const activeModelInfo = models.find((m) => m.name === selectedModel);
  const sizeLabel = activeModelInfo
    ? activeModelInfo.sizeMb >= 1000
      ? `${(activeModelInfo.sizeMb / 1000).toFixed(1)} GB`
      : `${activeModelInfo.sizeMb} MB`
    : '';

  const displayName = activeModelInfo?.label || selectedModel;

  return (
    <div className="p-6 overflow-y-auto thin-scrollbar space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Dictation</h2>
        <span
          className={cn(
            'inline-block h-2 w-2 rounded-full',
            serverStatus === 'running'
              ? 'bg-accent-green'
              : serverStatus === 'starting'
                ? 'bg-accent animate-pulse'
                : serverStatus === 'error'
                  ? 'bg-accent-red'
                  : 'bg-foreground-faint',
          )}
          title={`Server: ${serverStatus}`}
        />
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3">Model</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Dictation Model</div>
            <div className="text-xs text-foreground-muted">
              {sizeLabel ? `${displayName} (${sizeLabel})` : displayName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary"
          >
            Manage
          </button>
        </div>
      </div>

      {dialogOpen && (
        <DictationModelDialog onClose={() => setDialogOpen(false)} />
      )}

      {gpuAvailable && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3">Acceleration</h3>
          <ToggleRow
            label="GPU Acceleration"
            description={gpuName ? `Detected ${gpuName}` : 'Use CUDA for faster transcription'}
            checked={accelerator === 'gpu'}
            onChange={() => updateAccelerator(accelerator === 'gpu' ? 'cpu' : 'gpu')}
            disabled={gpuBinaryDownloading || status === 'recording'}
          />
          {gpuBinaryDownloading && gpuBinaryDownloadProgress && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs text-foreground-muted">
                <span>Downloading GPU runtime...</span>
                <span>{gpuBinaryDownloadProgress.percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-background-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${gpuBinaryDownloadProgress.percent}%` }}
                />
              </div>
              {gpuBinaryDownloadProgress.totalBytes > 0 && (
                <div className="text-xs text-foreground-faint">
                  {Math.round(gpuBinaryDownloadProgress.downloadedBytes / 1024 / 1024)} / {Math.round(gpuBinaryDownloadProgress.totalBytes / 1024 / 1024)} MB
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DictationPostProcessing />
      <DictationDictionary />
    </div>
  );
}
