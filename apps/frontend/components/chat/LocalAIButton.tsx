'use client';

import { useEffect, useState } from 'react';
import { Monitor } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Icon } from './Icon';
import { getCoordinatorClient, ensureCoordinatorConnection } from '@/lib/coordinator-client';
import { cn } from '@/lib/utils';

type LocalAIModel = {
  id: string;
  name: string;
  context: number;
  tools: boolean;
  enabled: boolean;
};

type LocalAIButtonProps = {
  disabled?: boolean;
};

export function LocalAIButton({ disabled = false }: LocalAIButtonProps) {
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const [isOpen, setIsOpen] = useState(false);
  const [models, setModels] = useState<LocalAIModel[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPullDialog, setShowPullDialog] = useState(false);

  const ollamaProvider = providers.find((p) => p.id === 'ollama');

  // Fetch Ollama models when popover opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchModels = async () => {
      setIsLoading(true);
      try {
        await ensureCoordinatorConnection();
        const client = getCoordinatorClient();
        const result = await client.listOllamaModels();

        setIsRunning(result.running);

        // Get the current enabled models from the provider
        const enabledModelIds = new Set(Object.keys(ollamaProvider?.models || {}));

        // Map the discovered models
        const mappedModels: LocalAIModel[] = result.models.map((model: any) => ({
          id: model.id,
          name: formatModelName(model.id),
          context: model.context || estimateContext(model.id),
          tools: model.tools !== false,
          enabled: enabledModelIds.has(model.id),
        }));

        setModels(mappedModels);
      } catch (error) {
        console.error('[LocalAIButton] Failed to fetch models:', error);
        setIsRunning(false);
        setModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, [isOpen, ollamaProvider]);

  const handleToggleModel = async (modelId: string) => {
    const newModels = models.map((m) =>
      m.id === modelId ? { ...m, enabled: !m.enabled } : m
    );
    setModels(newModels);

    const model = newModels.find((m) => m.id === modelId);
    if (!model) return;

    try {
      await ensureCoordinatorConnection();
      const client = getCoordinatorClient();

      // Write to OpenCode config with enabled models
      await client.writeOllamaConfig({
        models: newModels.filter((m) => m.enabled).map((m) => ({
          id: m.id,
          name: m.name,
        })),
      });

      // Note: OpenCode Desktop App will auto-detect config changes
      // The provider list will refresh on next open or can be manually triggered
    } catch (error) {
      console.error('[LocalAIButton] Failed to update config:', error);
      // Revert on error
      setModels(models);
    }
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModel({ providerID: 'ollama', modelID: modelId });
    setIsOpen(false);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await ensureCoordinatorConnection();
      const client = getCoordinatorClient();
      const result = await client.listOllamaModels();
      setIsRunning(result.running);
    } catch (error) {
      console.error('[LocalAIButton] Failed to refresh:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isSelectedModel = (modelId: string) => {
    return selectedModel?.providerID === 'ollama' && selectedModel?.modelID === modelId;
  };

  const hasEnabledModels = models.some((m) => m.enabled);

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Local AI"
            title="Local AI (Ollama)"
          >
            <Monitor className="size-5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium text-foreground">Local AI</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="size-5 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
            >
              <Icon name="close" size="small" />
            </button>
          </div>

          {/* Status */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            {isLoading ? (
              <div className="size-2 rounded-full bg-muted-foreground animate-pulse" />
            ) : isRunning ? (
              <div className="size-2 rounded-full bg-[var(--accent-green)]" />
            ) : (
              <div className="size-2 rounded-full bg-[var(--accent-red)]" />
            )}
            <span className="text-xs text-muted-foreground">
              {isLoading ? 'Checking...' : isRunning ? 'Ollama running' : 'Ollama not running'}
            </span>
          </div>

          {/* Models list */}
          <div className="max-h-64 overflow-y-auto thin-scrollbar">
            {isLoading ? (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center">
                Loading models...
              </div>
            ) : models.length === 0 ? (
              <div className="px-4 py-8 text-xs text-muted-foreground text-center">
                {isRunning ? 'No models found' : 'Start Ollama to see models'}
              </div>
            ) : (
              models.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--overlay-10)] transition-colors border-b border-border last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleModel(model.id)}
                    className="shrink-0"
                    aria-label={model.enabled ? 'Disable' : 'Enable'}
                  >
                    <div
                      className={cn(
                        "size-4 rounded-full border-2 transition-colors",
                        model.enabled
                          ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]"
                          : "border-muted-foreground bg-transparent"
                      )}
                    >
                      {model.enabled && (
                        <div className="flex items-center justify-center h-full">
                          <div className="size-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => model.enabled && handleSelectModel(model.id)}
                    disabled={!model.enabled}
                    className={cn(
                      "flex-1 text-left truncate text-xs transition-colors",
                      isSelectedModel(model.id)
                        ? "text-foreground font-medium"
                        : model.enabled
                          ? "text-foreground"
                          : "text-muted-foreground"
                    )}
                    title={model.name}
                  >
                    {model.name}
                  </button>

                  <button
                    type="button"
                    className="shrink-0 px-1 text-muted-foreground hover:text-foreground transition-colors text-xs"
                    aria-label="Settings"
                    title="Settings"
                  >
                    ⋯
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border p-2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] rounded-md transition-colors disabled:opacity-50"
              >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowPullDialog(true)}
              disabled={!isRunning || isLoading}
              className="flex-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] rounded-md transition-colors disabled:opacity-50"
            >
              Pull model…
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {showPullDialog && (
        <PullModelDialog
          onClose={() => setShowPullDialog(false)}
          onSuccess={() => {
            setShowPullDialog(false);
            handleRefresh();
          }}
        />
      )}
    </>
  );
}

// Helper to format model names (e.g., "qwen3:8b" -> "Qwen3 8B")
function formatModelName(name: string): string {
  const parts = name.split(':');
  const baseName = parts[0] || name;
  const tag = parts[1];

  // Capitalize first letter of each word
  const formatted = baseName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Add tag if present (e.g., "8b" -> " 8B")
  if (tag) {
    return `${formatted} ${tag.toUpperCase()}`;
  }

  return formatted;
}

// Estimate context window based on model name
function estimateContext(name: string): number {
  const lower = name.toLowerCase();

  // Size indicators
  if (lower.includes('70b') || lower.includes('72b')) return 128000;
  if (lower.includes('34b')) return 64000;
  if (lower.includes('32b')) return 32000;
  if (lower.includes('14b')) return 16000;
  if (lower.includes('13b')) return 16000;
  if (lower.includes('8b')) return 12000;
  if (lower.includes('7b')) return 8000;

  // Default for unknown sizes
  return 8000;
}

type PullModelDialogProps = {
  onClose: () => void;
  onSuccess: () => void;
};

function PullModelDialog({ onClose, onSuccess }: PullModelDialogProps) {
  const [modelInput, setModelInput] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const popularModels = [
    { id: 'qwen2.5:7b', name: 'Qwen 2.5 7B' },
    { id: 'qwen2.5:14b', name: 'Qwen 2.5 14B' },
    { id: 'llama3.2:3b', name: 'Llama 3.2 3B' },
    { id: 'llama3.2:1b', name: 'Llama 3.2 1B' },
    { id: 'mistral:7b', name: 'Mistral 7B' },
    { id: 'codellama:13b', name: 'Code Llama 13B' },
  ];

  const handlePull = async () => {
    const modelName = modelInput.trim();
    if (!modelName) return;

    setIsPulling(true);
    setError(null);

    try {
      await ensureCoordinatorConnection();
      const client = getCoordinatorClient();
      const result = await client.pullOllamaModel(modelName);

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to pull model');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull model');
    } finally {
      setIsPulling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-50)]">
      <div className="bg-background rounded-lg border border-border shadow-[var(--shadow-lg)] w-80 max-h-[80vh] overflow-auto thin-scrollbar">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium text-foreground">Pull Model</span>
          <button
            type="button"
            onClick={onClose}
            className="size-5 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
          >
            <Icon name="close" size="small" />
          </button>
        </div>

        <div className="p-4">
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="e.g., llama3.2:3b"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handlePull();
              }
            }}
          />

          {error && (
            <div className="mt-2 text-xs text-[var(--accent-red)]">{error}</div>
          )}

          <div className="mt-4">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Popular
            </div>
            <div className="flex flex-col gap-1">
              {popularModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setModelInput(model.id)}
                  className="text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground rounded-md transition-colors"
                >
                  {model.name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-10)] rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePull}
              disabled={!modelInput.trim() || isPulling}
              className="px-3 py-1.5 text-xs text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
            >
              {isPulling ? 'Pulling...' : 'Pull'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
