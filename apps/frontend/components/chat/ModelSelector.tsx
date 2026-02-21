'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useChatStore, type SelectedModel } from '@/stores/chatStore';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { ProviderIcon } from './ProviderIcon';
import { iconNames, type IconName } from './provider-icons/types';
import { SelectProviderDialog } from './SelectProviderDialog';
import { ConnectProviderDialog } from './ConnectProviderDialog';
import { ManageModelsDialog } from './ManageModelsDialog';
import { getCoordinatorClient, ensureCoordinatorConnection } from '@/lib/coordinator-client';
import { POPULAR_PROVIDERS } from '@/lib/model-constants';

const resolveProviderIcon = (id: string): IconName => (iconNames.includes(id as IconName) ? (id as IconName) : 'synthetic');

type ModelSelectorProps = {
  disabled?: boolean;
  compactLevel?: number;
};

const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
const COMPACT_SIZE_CLASSES = [
  'gap-1.5 px-2.5 max-w-[160px]',
  'gap-1.5 px-2.5 max-w-[16ch]',
  'gap-1 px-2 max-w-[12ch]',
  'gap-1 px-2 max-w-[7ch]',
] as const;

function resolveCompactLevel(level?: number): number {
  const maxLevel = COMPACT_LABEL_LENGTHS.length - 1;
  if (typeof level !== 'number' || Number.isNaN(level)) return 0;
  return Math.min(Math.max(level, 0), maxLevel);
}

function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

export function ModelSelector({ disabled = false, compactLevel }: ModelSelectorProps) {
  const providers = useChatStore((state) => state.providers);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const setSelectedModel = useChatStore((state) => state.setSelectedModel);
  const modelVisibility = useChatStore((state) => state.modelVisibility);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSelectProviderDialog, setShowSelectProviderDialog] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState<{ id: string; name: string } | null>(null);
  const [showManageDialog, setShowManageDialog] = useState(false);
  const resolvedLevel = resolveCompactLevel(compactLevel);

  useEffect(() => {
    if (isOpen) return;
    setSearchQuery('');
  }, [isOpen]);

  const isModelVisible = (model: SelectedModel) => {
    const state = modelVisibility[`${model.providerID}:${model.modelID}`];
    if (state === 'hide') return false;
    if (state === 'show') return true;
    return true;
  };

  const selectedProviderId = selectedModel?.providerID ?? '';
  const provider = providers.find((item) => item.id === selectedProviderId);
  const modelId = selectedModel?.modelID ?? '';
  const providerIcon = provider?.id ? resolveProviderIcon(provider.id) : null;

  const allModels = useMemo(() => {
    const models: Array<{
      providerID: string;
      providerName: string;
      modelID: string;
      modelName: string;
      isPopular: boolean;
    }> = [];

    for (const prov of providers) {
      const entries = Object.entries(prov.models || {});
      const isPopular = POPULAR_PROVIDERS.includes(prov.id);
      for (const [modelID, model] of entries) {
        if (!isModelVisible({ providerID: prov.id, modelID })) continue;
        const modelName = typeof model?.name === 'string' && model.name.trim().length > 0
          ? model.name
          : modelID;
        models.push({
          providerID: prov.id,
          providerName: prov.name,
          modelID,
          modelName,
          isPopular,
        });
      }
    }

    const filtered = models.filter(
      (model) =>
        model.modelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.providerName.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
  }, [providers, searchQuery, modelVisibility]);

  const groupedModels = useMemo(() => {
    const groups: Record<string, typeof allModels> = {};
    for (const model of allModels) {
      if (!groups[model.providerName]) {
        groups[model.providerName] = [];
      }
      groups[model.providerName].push(model);
    }
    return groups;
  }, [allModels]);

  const handleSelect = (providerID: string, modelID: string) => {
    setSelectedModel({ providerID, modelID });
    setIsOpen(false);
  };

  const handleConnectProvider = () => {
    setIsOpen(false);
    setShowSelectProviderDialog(true);
  };

  const handleManageModels = () => {
    setIsOpen(false);
    setShowManageDialog(true);
  };

  const handleManageConnectProvider = () => {
    setShowManageDialog(false);
    setShowSelectProviderDialog(true);
  };

  const handleConnectSuccess = async () => {
    setShowConnectDialog(null);
    try {
      await ensureCoordinatorConnection();
      const client = getCoordinatorClient();
      await client.listProviders();
      await useChatStore.getState().refreshProviders();
    } catch (error) {
      console.error('[ModelSelector] Failed to refresh providers:', error);
    }
  };

  const selectedName = provider?.models?.[modelId]?.name;
  const resolvedName = typeof selectedName === 'string' && selectedName.trim().length > 0
    ? selectedName
    : modelId;
  const displayText = provider && selectedModel ? resolvedName : 'Select model';
  const maxLength = COMPACT_LABEL_LENGTHS[resolvedLevel];
  const compactLabel = resolvedLevel === 0 ? displayText : getCompactLabel(displayText, maxLength);
  const showLabel = resolvedLevel < 3;
  const sizeClass = COMPACT_SIZE_CLASSES[resolvedLevel];

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            title={displayText}
            className={cn("h-7 min-w-0 rounded-md border border-transparent bg-transparent text-sm text-muted-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors", sizeClass)}
            aria-label={displayText}
          >
            {providerIcon ? (
              <ProviderIcon id={providerIcon} className="size-4 shrink-0" />
            ) : (
              <Icon name="providers" size="small" className="text-muted-foreground shrink-0" />
            )}
            {showLabel && <span className="text-foreground truncate min-w-0">{compactLabel}</span>}
            <ChevronDown className="size-4 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--md-accent)]"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-end gap-1 p-1 border-b border-border">
            <button
              type="button"
              onClick={() => handleConnectProvider()}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
              aria-label="Connect provider"
              title="Add new provider"
            >
              <Icon name="plus-small" size="normal" />
            </button>
            <button
              type="button"
              onClick={handleManageModels}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
              aria-label="Manage models"
              title="Manage models"
            >
              <Icon name="sliders" size="normal" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto max-h-56 thin-scrollbar">
            {Object.entries(groupedModels).map(([providerName, models]) => {
              const isFirstProvider = providerName === Object.keys(groupedModels)[0];

              return (
                <div key={providerName}>
                  {isFirstProvider && (
                    <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background">
                      {providerName}
                    </div>
                  )}
                  {!isFirstProvider && (
                    <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-background border-t border-border">
                      {providerName}
                    </div>
                  )}
                  {models.map((model) => {
                    const isSelected = selectedModel?.providerID === model.providerID && selectedModel?.modelID === model.modelID;
                    const isOllama = model.providerID === 'ollama';

                    return (
                      <button
                        key={`${model.providerID}:${model.modelID}`}
                        type="button"
                        onClick={() => handleSelect(model.providerID, model.modelID)}
                        className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="truncate flex-1">{model.modelName}</div>
                          {isOllama && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-green-500/10 text-green-500 whitespace-nowrap">
                              Local
                            </span>
                          )}
                          {isSelected && <Check className="size-3 text-muted-foreground shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {allModels.length === 0 && (
              <div className="px-3 py-8 text-xs text-muted-foreground text-center">No models found</div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {showSelectProviderDialog && (
        <SelectProviderDialog
          onClose={() => setShowSelectProviderDialog(false)}
          onProviderSelect={(providerId, providerName) => {
            setShowSelectProviderDialog(false);
            setShowConnectDialog({ id: providerId, name: providerName });
          }}
        />
      )}
      {showConnectDialog && (
        <ConnectProviderDialog
          providerId={showConnectDialog.id}
          providerName={showConnectDialog.name}
          onClose={() => setShowConnectDialog(null)}
          onSuccess={handleConnectSuccess}
        />
      )}
      {showManageDialog && (
        <ManageModelsDialog
          onClose={() => setShowManageDialog(false)}
          onConnectProvider={handleManageConnectProvider}
        />
      )}
    </>
  );
}
