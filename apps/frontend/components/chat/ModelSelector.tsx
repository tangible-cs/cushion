
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useChatStore, type SelectedModel } from '@/stores/chatStore';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Icon } from './Icon';
import { cn } from '@/lib/utils';
import { ProviderIcon } from './ProviderIcon';
import { resolveProviderIcon } from './provider-icons/types';
import { SelectProviderDialog } from './SelectProviderDialog';
import { ConnectProviderDialog } from './ConnectProviderDialog';
import { ManageModelsDialog } from './ManageModelsDialog';
import { createModelSorter } from '@/lib/model-constants';
import { POPULAR_PROVIDER_IDS } from '@/lib/popular-providers';

type ModelSelectorProps = {
  disabled?: boolean;
  compactLevel?: number;
};

const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
const COMPACT_SIZE_CLASSES = [
  'gap-1.5 pl-2 pr-1 max-w-[160px]',
  'gap-1.5 pl-2 pr-1 max-w-[16ch]',
  'gap-1 pl-2 pr-1 max-w-[12ch]',
  'gap-1 pl-2 pr-1 max-w-[7ch]',
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

  const isModelVisible = useChatStore((s) => s.isModelVisible);

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
    }> = [];

    for (const prov of providers) {
      const entries = Object.entries(prov.models || {});
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
        });
      }
    }

    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? models.filter(
        (model) =>
          model.modelName.toLowerCase().includes(query)
          || model.providerName.toLowerCase().includes(query)
      )
      : models;

    return filtered.sort(createModelSorter(POPULAR_PROVIDER_IDS));
  }, [providers, searchQuery, modelVisibility, POPULAR_PROVIDER_IDS]);

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
            className={cn(
              'group h-7 min-w-0 rounded-md border border-transparent bg-transparent text-[14px] font-normal text-muted-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center transition-colors',
              isOpen && 'bg-[var(--overlay-10)]',
              sizeClass
            )}
            aria-label={displayText}
          >
            {providerIcon ? (
              <ProviderIcon
                id={providerIcon}
                className={cn(
                  'size-4 shrink-0 transition-opacity duration-150',
                  isOpen ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
                )}
              />
            ) : (
              <Icon
                name="providers"
                size="small"
                className={cn(
                  'text-muted-foreground shrink-0 transition-opacity duration-150',
                  isOpen ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                )}
              />
            )}
            {showLabel && <span className="text-foreground truncate min-w-0 text-[14px] font-normal">{compactLabel}</span>}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="h-80 overflow-hidden p-2 flex flex-col !bg-surface-elevated !border-border">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface px-2">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Search models"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
            <button
              type="button"
              onClick={handleConnectProvider}
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
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {Object.entries(groupedModels).map(([providerName, models]) => (
              <div key={providerName}>
                <div className="sticky top-0 z-10 relative px-2 py-2 text-[13px] font-medium text-[var(--foreground-subtle)] bg-[var(--surface-elevated)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-gradient-to-b after:from-[var(--surface-elevated)] after:to-transparent">
                  {providerName}
                </div>
                <div className="space-y-0.5 pb-1">
                  {models.map((model) => {
                    const isSelected = selectedModel?.providerID === model.providerID && selectedModel?.modelID === model.modelID;

                    return (
                      <button
                        key={`${model.providerID}:${model.modelID}`}
                        type="button"
                        onClick={() => handleSelect(model.providerID, model.modelID)}
                        className="w-full rounded-md px-2 py-1.5 text-left text-[14px] font-normal text-foreground hover:bg-[var(--overlay-10)] focus-visible:bg-[var(--overlay-10)] focus-visible:outline-none transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <div className="truncate flex-1">{model.modelName}</div>
                          {isSelected && <Check className="size-3.5 text-foreground shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {allModels.length === 0 && (
              <div className="px-3 py-8 text-sm text-muted-foreground text-center">No models found</div>
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
