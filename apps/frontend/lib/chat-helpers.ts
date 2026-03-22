import type { Agent, Message, Provider, Session } from '@opencode-ai/sdk/v2/client';
import type { PromptSelection, SelectedModel } from '@/stores/chat-store-utils';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 26;
let opencodeTimestamp = 0;
let opencodeCounter = 0;

export function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `msg-${time}-${rand}`;
}

export function createContextId() {
  return createId().replace('msg-', 'ctx-');
}

function randomBase62(length: number) {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return result;
}

function createOpencodeId(prefix: 'msg' | 'prt') {
  const timestamp = Date.now();
  if (timestamp !== opencodeTimestamp) {
    opencodeTimestamp = timestamp;
    opencodeCounter = 0;
  }
  opencodeCounter += 1;
  const now = BigInt(timestamp) * BigInt(0x1000) + BigInt(opencodeCounter);
  const timeBytes = new Uint8Array(6);
  for (let i = 0; i < 6; i += 1) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  }
  const hex = Array.from(timeBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}${randomBase62(ID_LENGTH - 12)}`;
}

export function createMessageId() {
  return createOpencodeId('msg');
}

export function createPartId() {
  return createOpencodeId('prt');
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

export function resolveAbsolutePath(directory: string, path: string) {
  const normalizedPath = normalizePath(path);
  if (/^[A-Za-z]:\//.test(normalizedPath) || /^[A-Za-z]:$/.test(normalizedPath)) {
    return normalizedPath;
  }
  if (normalizedPath.startsWith('//')) return normalizedPath;
  if (normalizedPath.startsWith('/')) return normalizedPath;

  const root = normalizePath(directory).replace(/\/+$/, '');
  return `${root}/${normalizedPath}`;
}

export function encodeFilePath(filepath: string) {
  let normalized = normalizePath(filepath);
  if (/^[A-Za-z]:/.test(normalized)) {
    normalized = `/${normalized}`;
  }

  return normalized
    .split('/')
    .map((segment, index) => {
      if (index === 1 && /^[A-Za-z]:$/.test(segment)) return segment;
      return encodeURIComponent(segment);
    })
    .join('/');
}

export function buildFileUrl(directory: string, path: string, selection?: PromptSelection) {
  const absolute = resolveAbsolutePath(directory, path);
  const encodedPath = encodeFilePath(absolute);
  if (!selection) return `file://${encodedPath}`;
  const start = Math.min(selection.startLine, selection.endLine);
  const end = Math.max(selection.startLine, selection.endLine);
  return `file://${encodedPath}?start=${start}&end=${end}`;
}

// ---------------------------------------------------------------------------
// Selection comparison
// ---------------------------------------------------------------------------

export function sameSelection(a?: PromptSelection, b?: PromptSelection) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.startLine === b.startLine
    && a.startChar === b.startChar
    && a.endLine === b.endLine
    && a.endChar === b.endChar;
}

// ---------------------------------------------------------------------------
// Model / variant resolution
// ---------------------------------------------------------------------------

export type ModelVariantOption = {
  key: string;
  label: string;
};

function hasModel(provider: Provider | undefined, modelID: string) {
  if (!provider) return false;
  const models = provider.models || {};
  return Object.prototype.hasOwnProperty.call(models, modelID);
}

export function resolveModel(
  providers: Provider[],
  defaults: Record<string, string>,
  stored: SelectedModel | null
) {
  if (stored) {
    const provider = providers.find((item) => item.id === stored.providerID);
    if (hasModel(provider, stored.modelID)) return stored;
  }

  const defaultKeys = Object.keys(defaults);
  for (const key of defaultKeys) {
    const modelID = defaults[key];
    const provider = providers.find((item) => item.id === key);
    if (hasModel(provider, modelID)) {
      return { providerID: key, modelID };
    }
  }

  for (const provider of providers) {
    const modelKeys = Object.keys(provider.models || {});
    if (modelKeys.length > 0) {
      return { providerID: provider.id, modelID: modelKeys[0] };
    }
  }

  return null;
}

function normalizeModelVariants(variants: unknown): ModelVariantOption[] {
  if (!variants) return [];
  if (Array.isArray(variants)) {
    return variants
      .map((item) => {
        if (typeof item === 'string') {
          return { key: item, label: item };
        }
        if (!item || typeof item !== 'object') return null;
        const variant = item as { key?: unknown; id?: unknown; name?: unknown; label?: unknown };
        const key = (variant.key ?? variant.id ?? variant.name ?? variant.label);
        if (typeof key !== 'string' || !key) return null;
        const label = typeof variant.label === 'string'
          ? variant.label
          : typeof variant.name === 'string'
            ? variant.name
            : key;
        return { key, label };
      })
      .filter((item): item is ModelVariantOption => !!item);
  }
  if (typeof variants === 'object') {
    return Object.entries(variants as Record<string, unknown>)
      .map(([key, value]) => {
        if (!key) return null;
        if (typeof value === 'string') {
          return { key, label: value || key };
        }
        if (value && typeof value === 'object') {
          const variant = value as { label?: unknown; name?: unknown };
          const label = typeof variant.label === 'string'
            ? variant.label
            : typeof variant.name === 'string'
              ? variant.name
              : key;
          return { key, label };
        }
        return { key, label: key };
      })
      .filter((item): item is ModelVariantOption => !!item);
  }
  return [];
}

export function getModelVariantOptions(
  providers: Provider[],
  selectedModel: SelectedModel | null
): ModelVariantOption[] {
  if (!selectedModel) return [];
  const provider = providers.find((item) => item.id === selectedModel.providerID);
  const model = provider?.models?.[selectedModel.modelID] as { variants?: unknown } | undefined;
  return normalizeModelVariants(model?.variants);
}

export function resolveModelVariant(
  providers: Provider[],
  selectedModel: SelectedModel | null,
  variant: string | null | undefined
) {
  const options = getModelVariantOptions(providers, selectedModel);
  if (options.length === 0) return null;
  if (variant && options.some((option) => option.key === variant)) return variant;
  return null;
}

// ---------------------------------------------------------------------------
// Agent resolution
// ---------------------------------------------------------------------------

export function resolveAgentName(agents: Agent[], selected: string | null) {
  if (selected) return selected;
  const visible = agents.find((agent) => !agent.hidden);
  if (visible) return visible.name;
  return agents[0]?.name ?? null;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export function getSessionById(sessions: Session[], sessionID: string | null) {
  if (!sessionID) return undefined;
  return sessions.find((session) => session.id === sessionID);
}

export function findLastUserMessage(messages: Message[], beforeId?: string) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (beforeId && message.id >= beforeId) continue;
    return message;
  }
  return undefined;
}

export function findNextUserMessage(messages: Message[], afterId: string) {
  return messages.find((message) => message.role === 'user' && message.id > afterId);
}

