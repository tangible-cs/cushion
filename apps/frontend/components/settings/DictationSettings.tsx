import { useEffect, useState } from 'react';
import { useDictationStore } from '@/stores/dictationStore';
import { DictationModelDialog } from './DictationModelPicker';
import { DictationPostProcessing } from './DictationPostProcessing';
import { DictationDictionary } from './DictationDictionary';
import { cn } from '@/lib/utils';

export function DictationSettings() {
  const loadSettings = useDictationStore((s) => s.loadSettings);
  const serverStatus = useDictationStore((s) => s.serverStatus);
  const selectedModel = useDictationStore((s) => s.selectedModel);
  const models = useDictationStore((s) => s.models);
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

      <DictationPostProcessing />
      <DictationDictionary />
    </div>
  );
}
