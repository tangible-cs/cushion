'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X } from 'lucide-react';
import { useChatStore, type SelectedModel } from '@/stores/chatStore';
import { POPULAR_PROVIDERS } from '@/lib/model-constants';
import { ProviderIcon } from './ProviderIcon';
import { iconNames, type IconName } from './provider-icons/types';
import { Icon } from './Icon';

type ManageModelsDialogProps = {
  onClose: () => void;
  onConnectProvider: () => void;
};

type ModelEntry = {
  providerID: string;
  providerName: string;
  modelID: string;
  modelName: string;
};

const resolveProviderIcon = (id: string): IconName => (iconNames.includes(id as IconName) ? (id as IconName) : 'synthetic');

export function ManageModelsDialog({ onClose, onConnectProvider }: ManageModelsDialogProps) {
  const providers = useChatStore((state) => state.providers);
  const modelVisibility = useChatStore((state) => state.modelVisibility);
  const setModelVisibility = useChatStore((state) => state.setModelVisibility);
  const refreshProviders = useChatStore((state) => state.refreshProviders);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const allModels = useMemo(() => {
    const models: ModelEntry[] = [];

    for (const provider of providers) {
      const entries = Object.entries(provider.models || {});
      for (const [modelID, model] of entries) {
        const modelName = typeof model?.name === 'string' && model.name.trim().length > 0
          ? model.name
          : modelID;

        models.push({
          providerID: provider.id,
          providerName: provider.name,
          modelID,
          modelName,
        });
      }
    }

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const filtered = normalizedSearch
      ? models.filter((model) => {
        const haystack = `${model.providerName} ${model.modelName} ${model.modelID}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      : models;

    return filtered.sort((a, b) => {
      const aIndex = POPULAR_PROVIDERS.indexOf(a.providerID);
      const bIndex = POPULAR_PROVIDERS.indexOf(b.providerID);

      if (aIndex >= 0 && bIndex < 0) return -1;
      if (aIndex < 0 && bIndex >= 0) return 1;
      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;

      if (a.providerName !== b.providerName) {
        return a.providerName.localeCompare(b.providerName);
      }
      return a.modelName.localeCompare(b.modelName);
    });
  }, [providers, searchQuery]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, ModelEntry[]> = {};
    for (const model of allModels) {
      if (!groups[model.providerName]) {
        groups[model.providerName] = [];
      }
      groups[model.providerName].push(model);
    }
    return groups;
  }, [allModels]);

  const providerEntries = Object.entries(groupedModels);
  const firstProvider = providerEntries[0]?.[0];

  const handleToggle = (model: SelectedModel, next: boolean) => {
    setModelVisibility(model, next);
  };

  const isModelVisible = (model: SelectedModel) => {
    const state = modelVisibility[`${model.providerID}:${model.modelID}`];
    if (state === 'hide') return false;
    if (state === 'show') return true;
    return true;
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await refreshProviders().finally(() => setRefreshing(false));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg shadow-lg border border-border max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Manage Models</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Customize which models appear in the model selector.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh models"
              aria-label="Refresh models"
            >
              <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onConnectProvider}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <Icon name="plus-small" size="normal" />
              Connect provider
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search models"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--md-accent)]"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto thin-scrollbar">
          {allModels.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {searchQuery ? 'No model results' : 'No models available'}
            </div>
          ) : (
            providerEntries.map(([providerName, models]) => (
              <div key={providerName}>
                <div
                  className={`px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background flex items-center gap-2 ${
                    providerName === firstProvider ? '' : 'border-t border-border'
                  }`}
                >
                  <ProviderIcon
                    id={resolveProviderIcon(models[0]?.providerID ?? 'synthetic')}
                    className="size-4 text-muted-foreground shrink-0"
                  />
                  <span>{providerName}</span>
                </div>
                <div className="px-4">
                  {models.map((model) => {
                    const key = { providerID: model.providerID, modelID: model.modelID };
                    const visible = isModelVisible(key);
                    const label = `${visible ? 'Hide' : 'Show'} ${model.modelName}`;

                    return (
                      <div
                        key={`${model.providerID}:${model.modelID}`}
                        className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-b-0"
                        onClick={() => handleToggle(key, !visible)}
                      >
                        <span className="text-sm text-foreground truncate">{model.modelName}</span>
                        <VisibilityToggle checked={visible} label={label} onChange={(next) => handleToggle(key, next)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type VisibilityToggleProps = {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

function VisibilityToggle({ checked, label, onChange }: VisibilityToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onChange(!checked);
      }}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border border-border transition-colors ${
        checked ? 'bg-[var(--md-accent)]' : 'bg-muted/40'
      }`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-background shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
