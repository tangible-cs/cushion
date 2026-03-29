import { useEffect, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { useDictationStore } from '@/stores/dictationStore';
import { cn } from '@/lib/utils';
import { ToggleRow } from './FilesSettings';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama' },
] as const;

const MODEL_PLACEHOLDERS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  ollama: 'llama3.2',
};

const BASE_URL_PLACEHOLDERS: Record<string, string> = {
  ollama: 'http://localhost:11434',
};

export function DictationPostProcessing() {
  const updatePostProcessing = useDictationStore((s) => s.updatePostProcessing);
  const storePostProcessing = useDictationStore((s) => s.postProcessing);

  const [enabled, setEnabled] = useState(storePostProcessing.enabled);
  const [provider, setProvider] = useState(storePostProcessing.provider);
  const [apiKey, setApiKey] = useState(storePostProcessing.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(storePostProcessing.baseUrl || '');
  const [model, setModel] = useState(storePostProcessing.model);
  const [showKey, setShowKey] = useState(false);
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [fillerRemoval, setFillerRemoval] = useState(storePostProcessing.fillerRemoval ?? true);
  const [stutterCollapse, setStutterCollapse] = useState(storePostProcessing.stutterCollapse ?? true);
  const [includeNoteContext, setIncludeNoteContext] = useState(storePostProcessing.includeNoteContext ?? true);
  const [autoLearnCorrections, setAutoLearnCorrections] = useState(storePostProcessing.autoLearnCorrections ?? true);
  const [fuzzyCorrection, setFuzzyCorrection] = useState(storePostProcessing.fuzzyCorrection ?? true);
  const [dictionaryInPrompt, setDictionaryInPrompt] = useState(storePostProcessing.dictionaryInPrompt ?? true);
  const [skipShort, setSkipShort] = useState(storePostProcessing.skipShortTranscriptions ?? true);
  const [shortThreshold, setShortThreshold] = useState(storePostProcessing.shortTextThreshold ?? 3);

  useEffect(() => {
    setEnabled(storePostProcessing.enabled);
    setProvider(storePostProcessing.provider);
    setApiKey(storePostProcessing.apiKey || '');
    setBaseUrl(storePostProcessing.baseUrl || '');
    setModel(storePostProcessing.model);
    setFillerRemoval(storePostProcessing.fillerRemoval ?? true);
    setStutterCollapse(storePostProcessing.stutterCollapse ?? true);
    setIncludeNoteContext(storePostProcessing.includeNoteContext ?? true);
    setAutoLearnCorrections(storePostProcessing.autoLearnCorrections ?? true);
    setFuzzyCorrection(storePostProcessing.fuzzyCorrection ?? true);
    setDictionaryInPrompt(storePostProcessing.dictionaryInPrompt ?? true);
    setSkipShort(storePostProcessing.skipShortTranscriptions ?? true);
    setShortThreshold(storePostProcessing.shortTextThreshold ?? 3);
  }, [storePostProcessing]);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    updatePostProcessing({ enabled: next });
  };

  const handleProviderChange = (next: 'openai' | 'ollama') => {
    setProvider(next);
    const updates: Record<string, unknown> = { provider: next };
    if (next === 'ollama') {
      setBaseUrl('http://localhost:11434');
      updates.baseUrl = 'http://localhost:11434';
    } else if (next === 'openai') {
      setBaseUrl('');
      updates.baseUrl = undefined;
    }
    updatePostProcessing(updates);
  };

  const handleApiKeyBlur = () => {
    updatePostProcessing({ apiKey });
  };

  const handleBaseUrlBlur = () => {
    updatePostProcessing({ baseUrl: baseUrl || undefined });
  };

  const handleModelBlur = () => {
    updatePostProcessing({ model });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(15, Number(e.target.value) || 1));
    setShortThreshold(val);
    updatePostProcessing({ shortTextThreshold: val });
  };

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3">Text Cleanup</h3>

      <ToggleRow
        label="Remove filler words"
        description="Remove uh, um, hmm and similar filler sounds"
        checked={fillerRemoval}
        onChange={() => { const next = !fillerRemoval; setFillerRemoval(next); updatePostProcessing({ fillerRemoval: next }); }}
      />
      <ToggleRow
        label="Collapse stutters"
        description="Collapse repeated words (e.g. no no no → no)"
        checked={stutterCollapse}
        onChange={() => { const next = !stutterCollapse; setStutterCollapse(next); updatePostProcessing({ stutterCollapse: next }); }}
      />
      <ToggleRow
        label="Auto-learn corrections"
        description="Learn new words when you edit dictated text"
        checked={autoLearnCorrections}
        onChange={() => { const next = !autoLearnCorrections; setAutoLearnCorrections(next); updatePostProcessing({ autoLearnCorrections: next }); }}
      />

      <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3 mt-6">Post-Processing</h3>

      <ToggleRow
        label="Fuzzy correction"
        description="Auto-correct words using your dictionary"
        checked={fuzzyCorrection}
        onChange={() => { const next = !fuzzyCorrection; setFuzzyCorrection(next); updatePostProcessing({ fuzzyCorrection: next }); }}
      />

      <ToggleRow
        label="AI post-processing"
        description="Clean up transcribed text with an LLM"
        checked={enabled}
        onChange={() => { const next = !enabled; setEnabled(next); updatePostProcessing({ enabled: next }); }}
      />
      <ToggleRow
        label="Skip short phrases"
        description="Skip AI enhancement for very short phrases"
        checked={skipShort}
        disabled={!enabled}
        onChange={() => { const next = !skipShort; setSkipShort(next); updatePostProcessing({ skipShortTranscriptions: next }); }}
      />

      {enabled && skipShort && (
        <div className="flex items-center gap-3 py-2 pl-4">
          <div className="text-sm text-foreground-muted">Word threshold</div>
          <input
            type="number"
            min={1}
            max={15}
            value={shortThreshold}
            onChange={handleThresholdChange}
            className="w-16 px-2 py-1 text-sm text-center rounded-md bg-surface border border-border text-foreground focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      )}

      <ToggleRow
        label="Include note context"
        description="Send surrounding text to match tone and style"
        checked={includeNoteContext}
        disabled={!enabled}
        onChange={() => { const next = !includeNoteContext; setIncludeNoteContext(next); updatePostProcessing({ includeNoteContext: next }); }}
      />
      <ToggleRow
        label="Use dictionary with AI"
        description="Include custom dictionary in the AI prompt"
        checked={dictionaryInPrompt}
        disabled={!enabled}
        onChange={() => { const next = !dictionaryInPrompt; setDictionaryInPrompt(next); updatePostProcessing({ dictionaryInPrompt: next }); }}
      />

      <div className={cn("flex items-center justify-between mt-3", !enabled && "opacity-40")}>
        <div>
          <div className="text-sm font-medium">Processing Model</div>
          <div className="text-xs text-foreground-muted">
            {model || MODEL_PLACEHOLDERS[provider]} — {PROVIDERS.find((p) => p.value === provider)?.label}
          </div>
        </div>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => setModelDialogOpen(true)}
          className={cn(
            'text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary',
            !enabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          Manage
        </button>
      </div>

      {modelDialogOpen && (
        <ProcessingModelDialog
          enabled={enabled}
          provider={provider}
          apiKey={apiKey}
          baseUrl={baseUrl}
          model={model}
          showKey={showKey}
          onProviderChange={handleProviderChange}
          onApiKeyChange={setApiKey}
          onApiKeyBlur={handleApiKeyBlur}
          onBaseUrlChange={setBaseUrl}
          onBaseUrlBlur={handleBaseUrlBlur}
          onModelChange={setModel}
          onModelBlur={handleModelBlur}
          onToggleShowKey={() => setShowKey(!showKey)}
          onClose={() => setModelDialogOpen(false)}
        />
      )}
    </div>
  );
}

interface ProcessingModelDialogProps {
  enabled: boolean;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  showKey: boolean;
  onProviderChange: (provider: 'openai' | 'ollama') => void;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: () => void;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlBlur: () => void;
  onModelChange: (value: string) => void;
  onModelBlur: () => void;
  onToggleShowKey: () => void;
  onClose: () => void;
}

function ProcessingModelDialog({
  enabled,
  provider,
  apiKey,
  baseUrl,
  model,
  showKey,
  onProviderChange,
  onApiKeyChange,
  onApiKeyBlur,
  onBaseUrlChange,
  onBaseUrlBlur,
  onModelChange,
  onModelBlur,
  onToggleShowKey,
  onClose,
}: ProcessingModelDialogProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-confirm flex items-start justify-center pt-[15%] bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[460px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-semibold text-foreground">Processing Model</h3>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-foreground-muted px-5 mb-4">
          Configure the LLM provider and model used to clean up transcribed text.
        </p>

        <div className="px-5 pb-5 space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Provider</div>
            <div className="flex gap-1">
              {PROVIDERS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onProviderChange(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-md border transition-colors',
                    provider === opt.value
                      ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)] text-foreground'
                      : 'border-border text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)]',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {provider !== 'openai' && (
            <div>
              <label className="block text-sm font-medium mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                onBlur={onBaseUrlBlur}
                placeholder={BASE_URL_PLACEHOLDERS[provider]}
                className="w-full px-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          )}

          {provider !== 'ollama' && (
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  onBlur={onApiKeyBlur}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-9 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={onToggleShowKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-foreground-muted hover:text-foreground transition-colors"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              onBlur={onModelBlur}
              placeholder={MODEL_PLACEHOLDERS[provider]}
              className="w-full px-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
