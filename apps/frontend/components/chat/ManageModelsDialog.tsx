'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff } from 'lucide-react';
import { getCoordinatorClient } from '@/lib/coordinator-client';
import type { Provider, Model } from '@cushion/types';
import { Icon } from './Icon';

type ManageModelsDialogProps = {
  onClose: () => void;
};

export function ManageModelsDialog({ onClose }: ManageModelsDialogProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const client = getCoordinatorClient();
        const result = await client.listProviders();
        setProviders(result.providers);
        setConnected(result.connected);
      } catch (error) {
        console.error('[ManageModelsDialog] Failed to load providers:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProviders();
  }, []);

  const filteredProviders = providers.filter(
    (provider) =>
      provider.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Object.values(provider.models).some((model) =>
        model.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg border border-border max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Manage Models</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search providers and models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading providers...</div>
          ) : filteredProviders.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery ? 'No providers or models found' : 'No providers available'}
            </div>
          ) : (
            filteredProviders.map((provider) => {
              const isConnected = connected.includes(provider.id);
              const models = Object.values(provider.models);

              return (
                <div key={provider.id} className="border-b border-border">
                  <div className="px-4 py-3 bg-muted/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon name="providers" size="normal" />
                      <div>
                        <div className="font-medium">{provider.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {isConnected ? (
                            <span className="text-green-600">Connected</span>
                          ) : (
                            <span>Not connected</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {models.length} model{models.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="p-4">
                    {models.map((model) => (
                      <div key={model.id} className="flex items-center justify-between py-2 last:pb-0">
                        <div>
                          <div className="text-sm font-medium">{model.name}</div>
                          <div className="text-xs text-muted-foreground">
                            ${model.cost.input.toFixed(2)}/1M input • ${model.cost.output.toFixed(2)}/1M output
                          </div>
                        </div>
                        {model.capabilities.images && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Eye className="size-3" />
                            <span>Vision</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
