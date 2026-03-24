
import { useEffect, useState, type KeyboardEvent } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { cn } from '@/lib/utils';

interface OpenCodeSettingsProps {
  embedded?: boolean;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; dotClass: string }> = {
  idle: { label: 'Idle', dotClass: 'bg-foreground-faint' },
  connecting: { label: 'Connecting', dotClass: 'bg-accent' },
  connected: { label: 'Connected', dotClass: 'bg-accent-green' },
  reconnecting: { label: 'Reconnecting', dotClass: 'bg-accent' },
  error: { label: 'Error', dotClass: 'bg-accent-red' },
};

function normalizeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

export function OpenCodeSettings({ embedded = false }: OpenCodeSettingsProps) {
  const baseUrl = useChatStore((state) => state.baseUrl);
  const connection = useChatStore((state) => state.connection);
  const setBaseUrl = useChatStore((state) => state.setBaseUrl);

  const [value, setValue] = useState(baseUrl);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(baseUrl);
  }, [baseUrl]);

  const normalizedValue = normalizeInput(value);
  const isDirty = normalizedValue.length > 0 && normalizedValue !== baseUrl;

  const save = async () => {
    if (!normalizedValue) {
      setError('OpenCode URL is required.');
      return;
    }
    if (!isDirty) {
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await setBaseUrl(normalizedValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update OpenCode URL.');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void save();
  };

  return (
    <div className={cn(embedded ? 'px-6 py-4' : 'p-6 overflow-y-auto')}>
      <h2
        className={cn(
          embedded
            ? 'text-xs uppercase tracking-wide text-foreground-faint mb-3'
            : 'text-base font-semibold mb-4'
        )}
      >
        OpenCode
      </h2>

      <p className="text-xs text-foreground-muted">
        Set the OpenCode server endpoint used for chat, providers, and model metadata.
      </p>

      <label className="mt-3 block text-xs uppercase tracking-wide text-foreground-faint">
        Endpoint URL
      </label>

      <div className="mt-2 flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:14097"
          spellCheck={false}
          className="w-full px-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]"
        />

        <button
          type="button"
          onClick={() => void save()}
          disabled={!isDirty || saving}
          className="px-3 py-2 text-xs rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        <button
          type="button"
          onClick={() => {
            setValue(baseUrl);
            setError(null);
          }}
          disabled={!isDirty || saving}
          className="px-3 py-2 text-xs rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-surface-tertiary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-accent-red">{error}</div>}
      {!error && connection.status === 'error' && connection.error && (
        <div className="mt-2 text-xs text-accent-red">{connection.error}</div>
      )}

      <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
        <span className={cn('inline-block h-2 w-2 rounded-full', STATUS_CONFIG[connection.status].dotClass)} />
        <span>Connection: {STATUS_CONFIG[connection.status].label}</span>
      </div>

      <div className="mt-1 text-xs text-foreground-muted break-all">Current: {baseUrl}</div>
    </div>
  );
}
