'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw } from 'lucide-react';
import { getCoordinatorClient, ensureCoordinatorConnection } from '@/lib/coordinator-client';
import { Icon } from './Icon';

type Provider = {
  id: string;
  name: string;
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
        await ensureCoordinatorConnection();
        const client = getCoordinatorClient();
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
      await ensureCoordinatorConnection();
      const client = getCoordinatorClient();
      await client.refreshProviders();

      // Reload providers
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

  const filteredProviders = providers
    .filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const aIndex = popularProviders.indexOf(a.id);
      const bIndex = popularProviders.indexOf(b.id);

      if (aIndex >= 0 && bIndex < 0) return -1;
      if (aIndex < 0 && bIndex >= 0) return 1;
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;

      return a.name.localeCompare(b.name);
    });

  const groups = {
    popular: filteredProviders.filter(p => popularProviders.includes(p.id)),
    other: filteredProviders.filter(p => !popularProviders.includes(p.id)),
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg border border-border max-w-2xl w-full max-h-[600px] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Connect provider</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh providers from models.dev"
            >
              <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          {groups.popular.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background">
                Popular providers
              </div>
              {groups.popular.map(provider => {
                const isConnected = connected.has(provider.id);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onProviderSelect(provider.id, provider.name)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors border-b border-border last:border-b-0"
                  >
                    <Icon name="providers" size="normal" className="text-muted-foreground" />
                    <span className="flex-1 text-left">{provider.name}</span>
                    {provider.id === 'opencode' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500">Recommended</span>
                    )}
                    {isConnected && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Connected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {groups.other.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background border-t border-border">
                Other providers
              </div>
              {groups.other.map(provider => {
                const isConnected = connected.has(provider.id);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => onProviderSelect(provider.id, provider.name)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors border-b border-border last:border-b-0"
                  >
                    <Icon name="providers" size="normal" className="text-muted-foreground" />
                    <span className="flex-1 text-left">{provider.name}</span>
                    {isConnected && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500">Connected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {filteredProviders.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">No providers found</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
