'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, X } from 'lucide-react';
import { useChatStore, type SelectedModel } from '@/stores/chatStore';
import { POPULAR_PROVIDERS } from '@/lib/model-constants';
import { ProviderIcon } from './ProviderIcon';
import { iconNames, type IconName } from './provider-icons/types';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';

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

type ProviderGroup = {
  providerID: string;
  providerName: string;
  models: ModelEntry[];
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
    const groups: ProviderGroup[] = [];
    const byProvider = new Map<string, ProviderGroup>();

    for (const model of allModels) {
      const existing = byProvider.get(model.providerID);
      if (existing) {
        existing.models.push(model);
        continue;
      }

      const nextGroup: ProviderGroup = {
        providerID: model.providerID,
        providerName: model.providerName,
        models: [model],
      };

      byProvider.set(model.providerID, nextGroup);
      groups.push(nextGroup);
    }

    return groups;
  }, [allModels]);

  const handleToggle = (model: SelectedModel, next: boolean) => {
    setModelVisibility(model, next);
  };

  const isProviderVisible = (group: ProviderGroup) => {
    return group.models.every((model) => isModelVisible({ providerID: group.providerID, modelID: model.modelID }));
  };

  const handleProviderToggle = (group: ProviderGroup, next: boolean) => {
    for (const model of group.models) {
      setModelVisibility({ providerID: group.providerID, modelID: model.modelID }, next);
    }
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
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)] p-4" onClick={onClose}>
      <div
        className="flex max-h-[600px] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-surface-elevated shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-foreground">Manage models</h2>
            <p className="mt-0.5 text-xs text-[var(--foreground-subtle)]">
              Customize which models appear in the model selector.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground disabled:opacity-50"
              title="Refresh models"
              aria-label="Refresh models"
            >
              <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            </button>
            <button
              type="button"
              onClick={onConnectProvider}
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground"
            >
              <Icon name="plus-small" size="normal" />
              Connect provider
            </button>
            <button
              type="button"
              onClick={onClose}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground"
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
              placeholder="Search models"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="size-5 flex items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <Icon name="close" size="small" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
          {allModels.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searchQuery ? 'No model results' : 'No models available'}
            </div>
          ) : (
            groupedModels.map((group) => (
              <div key={group.providerID}>
                <div className="sticky top-0 z-10 relative flex items-center gap-3 px-2 py-2 text-[13px] font-medium text-[var(--foreground-subtle)] bg-[var(--surface-elevated)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[var(--surface-elevated)] after:to-transparent">
                  <div className="min-w-0 flex flex-1 items-center gap-2">
                    <ProviderIcon
                      id={resolveProviderIcon(group.providerID)}
                      className="size-4 text-muted-foreground shrink-0"
                    />
                    <span className="truncate">{group.providerName}</span>
                  </div>
                  <div className="flex w-9 shrink-0 justify-end" onClick={(event) => event.stopPropagation()}>
                    <VisibilityToggle
                      checked={isProviderVisible(group)}
                      label={`Toggle all ${group.providerName} models`}
                      onChange={(next) => handleProviderToggle(group, next)}
                    />
                  </div>
                </div>
                <div className="pb-2 space-y-1">
                  {group.models.map((model) => {
                    const key = { providerID: model.providerID, modelID: model.modelID };
                    const visible = isModelVisible(key);
                    const label = `${visible ? 'Hide' : 'Show'} ${model.modelName}`;

                    return (
                      <div
                        key={`${model.providerID}:${model.modelID}`}
                        className="flex w-full cursor-pointer items-center gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--overlay-10)]"
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggle(key, !visible)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          handleToggle(key, !visible);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{model.modelName}</span>
                        <div className="flex w-9 shrink-0 justify-end" onClick={(event) => event.stopPropagation()}>
                          <VisibilityToggle checked={visible} label={label} onChange={(next) => handleToggle(key, next)} />
                        </div>
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
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full border border-border transition-colors',
        checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]'
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  );
}
