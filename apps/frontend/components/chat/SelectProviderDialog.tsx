
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { ProviderIcon } from './ProviderIcon';
import { iconNames, type IconName } from './provider-icons/types';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';

type Provider = {
  id: string;
  name: string;
};

const RECOMMENDED_PROVIDER_IDS = new Set(['opencode', 'opencode-go']);

const PROVIDER_DESCRIPTIONS = [
  {
    match: (id: string) => id === 'opencode',
    description: 'Reliable optimized models',
  },
  {
    match: (id: string) => id === 'opencode-go',
    description: 'Low cost subscription for everyone',
  },
  {
    match: (id: string) => id === 'anthropic',
    description: 'Direct access to Claude models, including Pro and Max',
  },
  {
    match: (id: string) => id.startsWith('github-copilot'),
    description: 'AI models for coding assistance via GitHub Copilot',
  },
  {
    match: (id: string) => id === 'openai',
    description: 'GPT models for fast, capable general AI tasks',
  },
  {
    match: (id: string) => id === 'google',
    description: 'Gemini models for fast, structured responses',
  },
  {
    match: (id: string) => id === 'openrouter',
    description: 'Access all supported models from one provider',
  },
  {
    match: (id: string) => id === 'vercel',
    description: 'Unified access to AI models with smart routing',
  },
] as const;

const resolveProviderIcon = (id: string): IconName => (iconNames.includes(id as IconName) ? (id as IconName) : 'synthetic');

const getProviderDescription = (providerId: string): string | null => {
  for (const item of PROVIDER_DESCRIPTIONS) {
    if (item.match(providerId)) return item.description;
  }
  return null;
};

type SelectProviderDialogProps = {
  onClose: () => void;
  onProviderSelect: (providerId: string, providerName: string) => void;
};

export function SelectProviderDialog({ onClose, onProviderSelect }: SelectProviderDialogProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [popularProviders, setPopularProviders] = useState<string[]>([]);

  useEffect(() => {
    async function loadProviders() {
      try {
        const client = await getSharedCoordinatorClient();
        const [providersResult, popularResult] = await Promise.all([
          client.listProviders(),
          client.getPopularProviders(),
        ]);
        setProviders(providersResult.providers);
        setConnected(new Set(providersResult.connected));
        setPopularProviders(popularResult.ids);
      } catch (error) {
        console.error('[SelectProviderDialog] Failed to load providers:', error);
      }
    }

    loadProviders();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const client = await getSharedCoordinatorClient();
      await client.refreshProviders();

      const [providersResult, popularResult] = await Promise.all([
        client.listProviders(),
        client.getPopularProviders(),
      ]);
      setProviders(providersResult.providers);
      setConnected(new Set(providersResult.connected));
      setPopularProviders(popularResult.ids);
    } catch (error) {
      console.error('[SelectProviderDialog] Failed to refresh providers:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredProviders = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return providers
      .filter((provider) => {
        if (!normalizedQuery) return true;
        return provider.name.toLowerCase().includes(normalizedQuery)
          || provider.id.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aIndex = popularProviders.indexOf(a.id);
        const bIndex = popularProviders.indexOf(b.id);

        if (aIndex >= 0 && bIndex < 0) return -1;
        if (aIndex < 0 && bIndex >= 0) return 1;
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;

        return a.name.localeCompare(b.name);
      });
  }, [providers, popularProviders, searchQuery]);

  const groups = useMemo(
    () => ({
      popular: filteredProviders.filter((provider) => popularProviders.includes(provider.id)),
      other: filteredProviders.filter((provider) => !popularProviders.includes(provider.id)),
    }),
    [filteredProviders, popularProviders]
  );

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)] p-4" onClick={onClose}>
      <div
        className="flex max-h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-medium text-foreground">Connect provider</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh providers from models.dev"
              aria-label="Refresh providers"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="flex h-8 items-center gap-2 rounded-md bg-surface px-2">
            <Icon name="magnifying-glass-menu" size="small" className="shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search providers"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="size-5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <Icon name="close" size="small" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
          {([
            { label: 'Popular providers', items: groups.popular },
            { label: 'Other providers', items: groups.other },
          ] as const).map(({ label, items }) => items.length > 0 && (
            <div key={label}>
              <div className="sticky top-0 z-10 relative px-2 py-2 text-[13px] font-medium text-[var(--foreground-subtle)] bg-[var(--surface-elevated)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[var(--surface-elevated)] after:to-transparent">
                {label}
              </div>
              <div className="space-y-0.5 pb-1">
                {items.map((provider) => {
                  const isConnected = connected.has(provider.id);
                  const providerIcon = resolveProviderIcon(provider.id);
                  const description = getProviderDescription(provider.id);
                  const isRecommended = RECOMMENDED_PROVIDER_IDS.has(provider.id);

                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => onProviderSelect(provider.id, provider.name)}
                      className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none"
                    >
                      <div className="flex items-start gap-2.5">
                        <ProviderIcon id={providerIcon} className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{provider.name}</span>
                            {isRecommended && (
                              <span className="whitespace-nowrap rounded-full bg-[var(--accent-primary-12)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-primary)]">
                                Recommended
                              </span>
                            )}
                            {isConnected && (
                              <span className="whitespace-nowrap rounded-full bg-[var(--accent-green-12)] px-1.5 py-0.5 text-[10px] font-medium text-accent-green">
                                Connected
                              </span>
                            )}
                          </div>
                          {description && (
                            <p className="mt-0.5 text-xs text-[var(--foreground-subtle)]">{description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {filteredProviders.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">No providers found</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
