import { useEffect } from 'react';
import { Trash2, Download, X, Globe, Check, Star } from 'lucide-react';
import { useDictationStore } from '@/stores/dictationStore';
import { cn } from '@/lib/utils';
import type { DictationModelInfo, DictationModelCategory } from '@cushion/types';

const CATEGORY_ORDER: DictationModelCategory[] = ['Parakeet', 'Whisper', 'Moonshine', 'SenseVoice', 'GigaAM'];

interface DictationModelDialogProps {
  onClose: () => void;
}

export function DictationModelDialog({ onClose }: DictationModelDialogProps) {
  const models = useDictationStore((s) => s.models);
  const selectedModel = useDictationStore((s) => s.selectedModel);
  const downloadProgress = useDictationStore((s) => s.downloadProgress);
  const downloadModel = useDictationStore((s) => s.downloadModel);
  const cancelDownload = useDictationStore((s) => s.cancelDownload);
  const deleteModel = useDictationStore((s) => s.deleteModel);
  const selectModel = useDictationStore((s) => s.selectModel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Group models by category
  const grouped = new Map<DictationModelCategory, DictationModelInfo[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const model of models) {
    grouped.get(model.category)?.push(model);
  }

  return (
    <div
      className="fixed inset-0 z-confirm flex items-start justify-center pt-[10%] bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[520px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-base font-semibold text-foreground">Dictation Models</h3>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-foreground-muted px-5 mb-4">
          Larger models are more accurate but use more memory and take longer to transcribe.
        </p>

        <div className="px-5 pb-5 space-y-5 max-h-[55vh] overflow-y-auto thin-scrollbar">
          {CATEGORY_ORDER.map((cat) => {
            const catModels = grouped.get(cat);
            if (!catModels || catModels.length === 0) return null;

            return (
              <div key={cat}>
                <div className="text-[11px] font-medium text-foreground-faint uppercase tracking-wider mb-2">{cat}</div>
                <div className="space-y-1.5">
                  {catModels.map((model) => {
                    const isDownloading = downloadProgress?.model === model.name;
                    const isSelected = selectedModel === model.name;

                    return (
                      <ModelCard
                        key={model.name}
                        model={model}
                        isSelected={isSelected}
                        isDownloading={isDownloading}
                        downloadPercent={isDownloading ? downloadProgress?.percent ?? 0 : 0}
                        bytesPerSec={isDownloading ? downloadProgress?.bytesPerSec ?? 0 : 0}
                        onSelect={() => selectModel(model.name)}
                        onDownload={() => downloadModel(model.name)}
                        onDelete={() => deleteModel(model.name)}
                        onCancelDownload={cancelDownload}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ModelCard({
  model,
  isSelected,
  isDownloading,
  downloadPercent,
  bytesPerSec,
  onSelect,
  onDownload,
  onDelete,
  onCancelDownload,
}: {
  model: DictationModelInfo;
  isSelected: boolean;
  isDownloading: boolean;
  downloadPercent: number;
  bytesPerSec: number;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onCancelDownload: () => void;
}) {
  const isDownloaded = model.downloaded;
  const sizeLabel = model.sizeMb >= 1000
    ? `${(model.sizeMb / 1000).toFixed(1)} GB`
    : `${model.sizeMb} MB`;

  return (
    <div
      onClick={() => isDownloaded && onSelect()}
      className={cn(
        'relative rounded-md border px-3.5 py-2.5 transition-all group',
        isSelected && isDownloaded
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
          : isDownloaded
            ? 'border-[var(--border)] hover:border-[var(--border-subtle)] hover:bg-[var(--overlay-10)] cursor-pointer'
            : 'border-[var(--border)] opacity-60',
        isDownloading && 'opacity-100 border-[var(--border)]',
      )}
    >
      {/* Main content: two columns */}
      <div className="flex gap-3">
        {/* Left column: name, badges, description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground">{model.label}</span>

            {isSelected && isDownloaded && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
                <Check size={10} />
                Active
              </span>
            )}

            {model.isRecommended && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
                <Star size={10} />
                Recommended
              </span>
            )}
          </div>

          <p className="text-xs text-foreground-muted mt-0.5">{model.description}</p>
        </div>

        {/* Right column: accuracy + speed bars */}
        <div className="shrink-0 w-[140px] flex flex-col justify-center gap-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-foreground-faint w-[50px] shrink-0 text-right">accuracy</span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)]"
                style={{ width: `${Math.round(model.accuracyScore * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-foreground-faint w-[50px] shrink-0 text-right">speed</span>
            <div className="flex-1 h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)]"
                style={{ width: `${Math.round(model.speedScore * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: language left, action + size right */}
      <div className="flex items-center mt-2 text-[11px] text-foreground-faint">
        <span className="inline-flex items-center gap-1">
          <Globe size={11} />
          {model.languages.length === 1 && model.languages[0] !== 'multi'
            ? model.languages[0].toUpperCase()
            : model.languages[0] === 'multi'
              ? 'Multilingual'
              : `${model.languages.length} languages`}
        </span>

        <span className="flex-1" />

        {isDownloading ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancelDownload(); }}
            className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Cancel download"
          >
            <X size={12} />
            Cancel
          </button>
        ) : isDownloaded ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
            aria-label={`Delete ${model.label}`}
          >
            <Trash2 size={12} />
            Delete
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDownload(); }}
            className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label={`Download ${model.label}`}
          >
            <Download size={11} />
            {sizeLabel}
          </button>
        )}
      </div>

      {/* Download progress bar */}
      {isDownloading && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${downloadPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-foreground-faint">{downloadPercent}%</span>
            {bytesPerSec > 0 && (
              <span className="text-[10px] text-foreground-faint">
                {(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
