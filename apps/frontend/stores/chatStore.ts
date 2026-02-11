'use client';

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  Command,
  Event,
  Agent,
  Provider,
  ProviderAuthError,
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
  TextPartInput,
  FilePartInput,
  AgentPartInput,
  Todo,
  FileDiff,
} from '@opencode-ai/sdk/v2/client';
import { createOpenCodeClient } from '@/lib/opencode-client';
import type { OpenCodeClient } from '@/lib/opencode-client';
import {
  getOpenCodeStatus,
  getSharedOpenCodeClient,
  onOpenCodeEvent,
  onOpenCodeStatus,
  type OpenCodeConnectionState,
} from '@/lib/shared-opencode-client';

type OpenCodeDirectory = string;

type ModelVisibility = 'show' | 'hide';

type ChatState = {
  baseUrl: string;
  directory: OpenCodeDirectory | null;
  client: OpenCodeClient | null;
  connection: OpenCodeConnectionState;
  activeSessionId: string | null;
  promptText: string;
  contextItems: PromptContextItem[];
  contextBySession: Record<string, PromptContextItem[]>;
  promptBySession: Record<string, string>;
  promptSessionOrder: string[];
  activeSessionByDirectory: Record<string, string | null>;
  agents: Agent[];
  selectedAgent: string | null;
  selectedAgentByDirectory: Record<string, string | null>;
  commands: Command[];
  providers: Provider[];
  providerDefaults: Record<string, string>;
  modelVisibility: Record<string, ModelVisibility>;
  selectedModel: SelectedModel | null;
  selectedModelByDirectory: Record<string, SelectedModel | null>;
  selectedVariant: string | null;
  selectedVariantByDirectory: Record<string, string | null>;
  providerAuthErrors: Record<string, string>;
  messageMeta: Record<string, MessageMeta>;
  sessions: Session[];
  messages: Record<string, Message[]>;
  parts: Record<string, Part[]>;
  sessionStatus: Record<string, SessionStatus>;
  sessionDiffs: Record<string, FileDiff[]>;
  todos: Record<string, Todo[]>;
  permissions: Record<string, PermissionRequest[]>;
  questions: Record<string, QuestionRequest[]>;
  sessionErrors: Record<string, string | undefined>;
};

type ChatActions = {
  connect: (directory: OpenCodeDirectory) => Promise<void>;
  disconnect: () => void;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  applyEvent: (event: Event, directory: OpenCodeDirectory) => void;
  sendPrompt: (input: PromptInputPayload) => Promise<void>;
  loadSessionMessages: (sessionID: string, limit?: number) => Promise<void>;
  loadMoreMessages: (sessionID: string) => Promise<void>;
  addContextItem: (item: Omit<PromptContextItem, 'id'>) => void;
  removeContextItem: (id: string) => void;
  clearContextItems: () => void;
  setPromptText: (text: string) => void;
  setSelectedAgent: (agent: string | null) => void;
  setActiveSession: (sessionID: string | null) => Promise<void>;
  setSelectedModel: (model: SelectedModel | null) => void;
  isModelVisible: (model: SelectedModel) => boolean;
  setModelVisibility: (model: SelectedModel, visible: boolean) => void;
  setSelectedVariant: (variant: string | null) => void;
  clearProviderAuthError: (providerID: string) => void;
  requestProviderAuth: (providerID: string) => Promise<string | null>;
  refreshProviders: () => Promise<void>;
  respondToPermission: (input: { sessionID: string; permissionID: string; response: 'once' | 'always' | 'reject' }) => Promise<void>;
  replyToQuestion: (input: { requestID: string; answers: string[][] }) => Promise<void>;
  rejectQuestion: (input: { requestID: string }) => Promise<void>;
  abortSession: (sessionID?: string | null) => Promise<void>;
  undoSession: () => Promise<void>;
  redoSession: () => Promise<void>;
  compactSession: () => Promise<void>;
  shareSession: () => Promise<string | null>;
  unshareSession: () => Promise<void>;
};

const initialState: ChatState = {
  baseUrl: getOpenCodeStatus().baseUrl,
  directory: null,
  client: null,
  connection: getOpenCodeStatus(),
  activeSessionId: null,
  promptText: '',
  contextItems: [],
  contextBySession: {},
  promptBySession: {},
  promptSessionOrder: [],
  activeSessionByDirectory: {},
  agents: [],
  selectedAgent: null,
  selectedAgentByDirectory: {},
  commands: [],
  providers: [],
  providerDefaults: {},
  modelVisibility: {},
  selectedModel: null,
  selectedModelByDirectory: {},
  selectedVariant: null,
  selectedVariantByDirectory: {},
  providerAuthErrors: {},
  messageMeta: {},
  sessions: [],
  messages: {},
  parts: {},
  sessionStatus: {},
  sessionDiffs: {},
  todos: {},
  permissions: {},
  questions: {},
  sessionErrors: {},
};

let unsubscribeEvents: (() => void) | null = null;
let unsubscribeStatus: (() => void) | null = null;
let activeDirectory: OpenCodeDirectory | null = null;

function cleanupSubscriptions() {
  if (unsubscribeEvents) unsubscribeEvents();
  if (unsubscribeStatus) unsubscribeStatus();
  unsubscribeEvents = null;
  unsubscribeStatus = null;
  activeDirectory = null;
}

function insertSortedById<T>(list: T[], item: T, getId: (value: T) => string) {
  const id = getId(item);
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const currentId = getId(list[mid]);
    if (currentId === id) {
      const next = list.slice();
      next[mid] = item;
      return next;
    }
    if (currentId < id) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const next = list.slice();
  next.splice(low, 0, item);
  return next;
}

function removeById<T>(list: T[], id: string, getId: (value: T) => string) {
  const index = list.findIndex((item) => getId(item) === id);
  if (index < 0) return list;
  const next = list.slice();
  next.splice(index, 1);
  return next;
}

function upsertSession(list: Session[], session: Session) {
  const next = insertSortedById(list, session, (item) => item.id);
  return next.slice().sort((a, b) => b.time.updated - a.time.updated);
}

function removeSession(list: Session[], sessionId: string) {
  return list.filter((session) => session.id !== sessionId);
}

function upsertMessage(list: Message[], message: Message) {
  const index = list.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    const next = list.slice();
    next[index] = message;
    return next;
  }
  const next = list.slice();
  next.push(message);
  next.sort((a, b) => a.time.created - b.time.created);
  return next;
}

function removeMessage(list: Message[], messageId: string) {
  return list.filter((item) => item.id !== messageId);
}

const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ID_LENGTH = 26;
let opencodeTimestamp = 0;
let opencodeCounter = 0;

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const rand = Math.random().toString(36).slice(2);
  const time = Date.now().toString(36);
  return `msg-${time}-${rand}`;
}

function createContextId() {
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

function createMessageId() {
  return createOpencodeId('msg');
}

function createPartId() {
  return createOpencodeId('prt');
}

function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}

function resolveAbsolutePath(directory: string, path: string) {
  const basePath = normalizePath(path);
  const root = normalizePath(directory);
  return /^(?:[a-zA-Z]:\/|\/)/.test(basePath) ? basePath : `${root}/${basePath}`;
}

function buildFileUrl(directory: string, path: string, selection?: PromptSelection) {
  const absolute = resolveAbsolutePath(directory, path);
  if (!selection) return `file://${absolute}`;
  const start = Math.min(selection.startLine, selection.endLine);
  const end = Math.max(selection.startLine, selection.endLine);
  return `file://${absolute}?start=${start}&end=${end}`;
}

function getPromptKey(directory: string, sessionId: string | null) {
  return `${normalizePath(directory)}::${sessionId ?? WORKSPACE_SESSION_KEY}`;
}

function getStoredPromptText(state: ChatState, directory: string, sessionId: string | null) {
  const key = getPromptKey(directory, sessionId);
  return state.promptBySession[key] ?? '';
}

function getStoredContextItems(state: ChatState, directory: string, sessionId: string | null) {
  const key = getPromptKey(directory, sessionId);
  return state.contextBySession[key] ?? [];
}

function touchPromptSession(order: string[], key: string) {
  if (order[order.length - 1] === key) return order;
  const index = order.indexOf(key);
  if (index < 0) return [...order, key];
  const next = order.slice();
  next.splice(index, 1);
  next.push(key);
  return next;
}

function touchPromptSessions(order: string[], keys: string[]) {
  return keys.reduce((current, key) => touchPromptSession(current, key), order);
}

function prunePromptSessions(
  order: string[],
  promptBySession: Record<string, string>,
  contextBySession: Record<string, PromptContextItem[]>
) {
  if (order.length <= MAX_PROMPT_SESSIONS) {
    return { promptSessionOrder: order, promptBySession, contextBySession };
  }
  const promptSessionOrder = order.slice(-MAX_PROMPT_SESSIONS);
  const keep = new Set(promptSessionOrder);
  const nextPrompt = Object.fromEntries(
    Object.entries(promptBySession).filter(([key]) => keep.has(key))
  );
  const nextContext = Object.fromEntries(
    Object.entries(contextBySession).filter(([key]) => keep.has(key))
  );
  return {
    promptSessionOrder,
    promptBySession: nextPrompt,
    contextBySession: nextContext,
  };
}

type InlineToken = {
  raw: string;
  token: string;
  start: number;
  end: number;
};

type InlineFileReference = {
  path: string;
  selection?: PromptSelection;
  start: number;
  end: number;
  value: string;
};

type InlineAgentReference = {
  name: string;
  start: number;
  end: number;
  value: string;
};

function parseInlineTokens(text: string): InlineToken[] {
  const matches: InlineToken[] = [];
  const regex = /@([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[0];
    const token = match[1] ?? '';
    if (!token) continue;
    const start = match.index ?? 0;
    matches.push({ raw, token, start, end: start + raw.length });
  }
  return matches;
}

function resolveInlineReferences(
  text: string,
  contextItems: PromptContextItem[],
  agents: Agent[]
) {
  const tokens = parseInlineTokens(text);
  const agentMap = new Map(
    agents
      .filter((agent) => !agent.hidden && agent.mode !== 'primary')
      .map((agent) => [agent.name.toLowerCase(), agent.name])
  );
  const fileMap = new Map<string, PromptContextItem[]>();

  for (const item of contextItems) {
    const name = item.path.split(/[/\\]/).pop() || item.path;
    const key = name.toLowerCase();
    const list = fileMap.get(key);
    if (list) {
      list.push(item);
    } else {
      fileMap.set(key, [item]);
    }
    const normalizedPath = normalizePath(item.path).toLowerCase();
    if (!fileMap.has(normalizedPath)) {
      fileMap.set(normalizedPath, [item]);
    }
  }

  const fileIndices = new Map<string, number>();
  const fileRefs: InlineFileReference[] = [];
  const agentRefs: InlineAgentReference[] = [];

  for (const token of tokens) {
    const key = token.token.toLowerCase();
    const agentName = agentMap.get(key);
    if (agentName) {
      agentRefs.push({ name: agentName, start: token.start, end: token.end, value: token.raw });
      continue;
    }

    const files = fileMap.get(key);
    if (!files || files.length === 0) continue;
    const index = fileIndices.get(key) ?? 0;
    const item = files[index] ?? files[0];
    fileIndices.set(key, index + 1);
    fileRefs.push({
      path: item.path,
      selection: item.selection,
      start: token.start,
      end: token.end,
      value: token.raw,
    });
  }

  return { fileRefs, agentRefs };
}

function sameSelection(a?: PromptSelection, b?: PromptSelection) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.startLine === b.startLine
    && a.startChar === b.startChar
    && a.endLine === b.endLine
    && a.endChar === b.endChar;
}

function hasModel(provider: Provider | undefined, modelID: string) {
  if (!provider) return false;
  const models = provider.models || {};
  return Object.prototype.hasOwnProperty.call(models, modelID);
}

function resolveModel(
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

type ModelVariantOption = {
  key: string;
  label: string;
};

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

function resolveModelVariant(
  providers: Provider[],
  selectedModel: SelectedModel | null,
  variant: string | null | undefined
) {
  const options = getModelVariantOptions(providers, selectedModel);
  if (options.length === 0) return null;
  if (variant && options.some((option) => option.key === variant)) return variant;
  return null;
}

function resolveAgentName(agents: Agent[], selected: string | null) {
  if (selected) return selected;
  const visible = agents.find((agent) => !agent.hidden);
  if (visible) return visible.name;
  return agents[0]?.name ?? null;
}

function getSessionById(sessions: Session[], sessionID: string | null) {
  if (!sessionID) return undefined;
  return sessions.find((session) => session.id === sessionID);
}

function findLastUserMessage(messages: Message[], beforeId?: string) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    if (beforeId && message.id >= beforeId) continue;
    return message;
  }
  return undefined;
}

function findNextUserMessage(messages: Message[], afterId: string) {
  return messages.find((message) => message.role === 'user' && message.id > afterId);
}

function getProviderAuthError(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  if (!('name' in error)) return null;
  if ((error as { name?: string }).name !== 'ProviderAuthError') return null;
  return error as ProviderAuthError;
}

export type PromptAttachment = {
  id: string;
  url: string;
  mime: string;
  filename: string;
};

export type PromptSelection = {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
};

export type PromptContextItem = {
  id: string;
  path: string;
  selection?: PromptSelection;
  preview?: string;
  comment?: string;
  commentID?: string;
  commentOrigin?: 'review' | 'file';
};

export type PromptInputPayload = {
  text: string;
  attachments?: PromptAttachment[];
  mode?: 'prompt' | 'shell';
};

const MAX_CONTEXT_ITEMS = 20;
const DEFAULT_MESSAGE_LIMIT = 200;
const WORKSPACE_SESSION_KEY = '__workspace__';
const MAX_PROMPT_SESSIONS = 20;

type MessageMeta = {
  limit: number;
  loading: boolean;
  hasMore: boolean;
};

export type SelectedModel = {
  providerID: string;
  modelID: string;
};

function getModelVisibilityKey(model: SelectedModel) {
  return `${model.providerID}:${model.modelID}`;
}

function resolveModelVisibility(map: Record<string, ModelVisibility>, model: SelectedModel) {
  const state = map[getModelVisibilityKey(model)];
  if (state === 'hide') return false;
  if (state === 'show') return true;
  return true;
}

type ResultData<T> = { data: T };

function unwrap<T>(result: T | ResultData<T>): T {
  if (typeof result === 'object' && result !== null && 'data' in result) {
    return (result as ResultData<T>).data;
  }
  return result as T;
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return getOpenCodeStatus().baseUrl;
  return trimmed.replace(/\/+$/, '');
}

function getDirectoryClient(directory: string, baseUrl?: string) {
  const resolved = baseUrl ? normalizeBaseUrl(baseUrl) : getOpenCodeStatus().baseUrl;
  return createOpenCodeClient({ baseUrl: resolved, directory, throwOnError: true });
}

function getSessionErrorMessage(error: unknown) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  if (typeof error === 'object' && 'type' in error) {
    const typeValue = (error as { type?: unknown }).type;
    if (typeof typeValue === 'string') return typeValue;
  }
  return 'Unknown error';
}

export const useChatStore = create<ChatState & ChatActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

    addContextItem: (item: Omit<PromptContextItem, 'id'>) => {
      const next = { ...item, id: createContextId() };
      set((state) => {
        const exists = state.contextItems.some((entry) =>
          entry.path === next.path
          && sameSelection(entry.selection, next.selection)
          && (entry.commentID ?? entry.comment ?? '') === (next.commentID ?? next.comment ?? '')
        );
        if (exists) return state;
        const contextItems = [...state.contextItems, next].slice(-MAX_CONTEXT_ITEMS);
        const directory = state.directory;
        if (!directory) return { contextItems };
        const sessionKey = getPromptKey(directory, state.activeSessionId);
        const nextContextBySession = {
          ...state.contextBySession,
          [sessionKey]: contextItems,
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          state.promptBySession,
          nextContextBySession
        );
        return {
          contextItems,
          contextBySession: pruned.contextBySession,
          promptBySession: pruned.promptBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });
    },

    removeContextItem: (id: string) => {
      set((state) => {
        const contextItems = state.contextItems.filter((entry) => entry.id !== id);
        const directory = state.directory;
        if (!directory) return { contextItems };
        const sessionKey = getPromptKey(directory, state.activeSessionId);
        const nextContextBySession = {
          ...state.contextBySession,
          [sessionKey]: contextItems,
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          state.promptBySession,
          nextContextBySession
        );
        return {
          contextItems,
          contextBySession: pruned.contextBySession,
          promptBySession: pruned.promptBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });
    },

    clearContextItems: () => {
      set((state) => {
        const directory = state.directory;
        if (!directory) return { contextItems: [] };
        const sessionKey = getPromptKey(directory, state.activeSessionId);
        const nextContextBySession = {
          ...state.contextBySession,
          [sessionKey]: [],
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          state.promptBySession,
          nextContextBySession
        );
        return {
          contextItems: [],
          contextBySession: pruned.contextBySession,
          promptBySession: pruned.promptBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });
    },

    setPromptText: (text: string) => {
      set((state) => {
        const directory = state.directory;
        if (!directory) return { promptText: text };
        const sessionKey = getPromptKey(directory, state.activeSessionId);
        const nextPromptBySession = {
          ...state.promptBySession,
          [sessionKey]: text,
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          nextPromptBySession,
          state.contextBySession
        );
        return {
          promptText: text,
          promptBySession: pruned.promptBySession,
          contextBySession: pruned.contextBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });
    },

    setSelectedAgent: (agent: string | null) => {
      set((state) => {
        const directory = state.directory;
        if (!directory) return { selectedAgent: agent };
        return {
          selectedAgent: agent,
          selectedAgentByDirectory: {
            ...state.selectedAgentByDirectory,
            [directory]: agent,
          },
        };
      });
    },

    setSelectedModel: (model: SelectedModel | null) => {
      set((state) => {
        const directory = state.directory;
        const nextVisibility = model
          ? {
              ...state.modelVisibility,
              [getModelVisibilityKey(model)]: 'show' as ModelVisibility,
            }
          : state.modelVisibility;
        if (!directory) {
          const resolvedVariant = resolveModelVariant(state.providers, model, state.selectedVariant);
          return {
            selectedModel: model,
            selectedVariant: resolvedVariant,
            modelVisibility: nextVisibility,
          };
        }
        const resolvedVariant = resolveModelVariant(
          state.providers,
          model,
          state.selectedVariantByDirectory[directory] ?? state.selectedVariant
        );
        return {
          selectedModel: model,
          selectedModelByDirectory: {
            ...state.selectedModelByDirectory,
            [directory]: model,
          },
          selectedVariant: resolvedVariant,
          selectedVariantByDirectory: {
            ...state.selectedVariantByDirectory,
            [directory]: resolvedVariant,
          },
          modelVisibility: nextVisibility,
        };
      });
    },

    isModelVisible: (model: SelectedModel) => {
      return resolveModelVisibility(get().modelVisibility, model);
    },

    setModelVisibility: (model: SelectedModel, visible: boolean) => {
      const key = getModelVisibilityKey(model);
      const visibility: ModelVisibility = visible ? 'show' : 'hide';
      set((state) => ({
        modelVisibility: {
          ...state.modelVisibility,
          [key]: visibility,
        },
      }));
    },

    setSelectedVariant: (variant: string | null) => {
      set((state) => {
        const directory = state.directory;
        if (!directory) return { selectedVariant: variant };
        return {
          selectedVariant: variant,
          selectedVariantByDirectory: {
            ...state.selectedVariantByDirectory,
            [directory]: variant,
          },
        };
      });
    },

    clearProviderAuthError: (providerID: string) => {
      set((state) => {
        if (!state.providerAuthErrors[providerID]) return state;
        const next = { ...state.providerAuthErrors };
        delete next[providerID];
        return { providerAuthErrors: next };
      });
    },

    requestProviderAuth: async (providerID: string) => {
      const directory = get().directory;
      if (!directory) return null;
      const client = getDirectoryClient(directory, get().baseUrl);
      const response = await client.provider.oauth.authorize({ providerID, directory }).catch(() => undefined);
      const data = response ? unwrap(response) : undefined;
      if (!data) return null;
      return data.url ?? null;
    },

    refreshProviders: async () => {
      const directory = get().directory;
      if (!directory) return;
      const client = getDirectoryClient(directory, get().baseUrl);
      await client.instance.dispose().catch(() => undefined);
      const providerResult = await client.config.providers({ directory }).catch(() => undefined);
      const providerData = providerResult ? unwrap(providerResult) : undefined;
      if (!providerData) return;

      const providers = providerData.providers ?? get().providers;
      const providerDefaults = providerData.default ?? get().providerDefaults;
      const storedModel = get().selectedModelByDirectory[directory] ?? get().selectedModel ?? null;
      const storedVariant = get().selectedVariantByDirectory[directory] ?? get().selectedVariant;
      const selectedModelResolved = resolveModel(providers, providerDefaults, storedModel);
      const selectedVariantResolved = resolveModelVariant(providers, selectedModelResolved, storedVariant);

      set((state) => ({
        providers,
        providerDefaults,
        selectedModel: selectedModelResolved,
        selectedModelByDirectory: {
          ...state.selectedModelByDirectory,
          [directory]: selectedModelResolved,
        },
        selectedVariant: selectedVariantResolved,
        selectedVariantByDirectory: {
          ...state.selectedVariantByDirectory,
          [directory]: selectedVariantResolved,
        },
      }));
    },

    respondToPermission: async ({ sessionID, permissionID, response }) => {
      const directory = get().directory;
      if (!directory) return;
      const client = getDirectoryClient(directory, get().baseUrl);
      await client.permission.respond({ sessionID, permissionID, response, directory }).catch(() => undefined);
    },

    replyToQuestion: async ({ requestID, answers }) => {
      const directory = get().directory;
      if (!directory) return;
      const client = getDirectoryClient(directory, get().baseUrl);
      await client.question.reply({ requestID, answers, directory }).catch(() => undefined);
    },

    rejectQuestion: async ({ requestID }) => {
      const directory = get().directory;
      if (!directory) return;
      const client = getDirectoryClient(directory, get().baseUrl);
      await client.question.reject({ requestID, directory }).catch(() => undefined);
    },

    setBaseUrl: async (baseUrl: string) => {
      const next = normalizeBaseUrl(baseUrl);
      if (next === get().baseUrl) return;
      set({ baseUrl: next });
      const directory = get().directory;
      if (!directory) return;
      await get().connect(directory);
    },

    setActiveSession: async (sessionID: string | null) => {
      const directory = get().directory;
      if (!directory) return;
      set((state) => {
        const sessionKey = getPromptKey(directory, sessionID);
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          state.promptBySession,
          state.contextBySession
        );
        const storedState = {
          ...state,
          promptBySession: pruned.promptBySession,
          contextBySession: pruned.contextBySession,
        };
        return {
          activeSessionId: sessionID,
          activeSessionByDirectory: {
            ...state.activeSessionByDirectory,
            [directory]: sessionID,
          },
          contextItems: getStoredContextItems(storedState, directory, sessionID),
          promptText: getStoredPromptText(storedState, directory, sessionID),
          promptBySession: pruned.promptBySession,
          contextBySession: pruned.contextBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });
      if (sessionID && !get().messages[sessionID]) {
        await get().loadSessionMessages(sessionID);
      }
    },

    connect: async (directory: OpenCodeDirectory) => {
      if (activeDirectory === directory && get().client) return;

      cleanupSubscriptions();
      activeDirectory = directory;

      const baseUrl = get().baseUrl;
      const client = await getSharedOpenCodeClient({ baseUrl });
      const state = get();
      const activeSessionId = state.activeSessionByDirectory[directory] ?? null;
      const contextItems = getStoredContextItems(state, directory, activeSessionId);
      const promptText = getStoredPromptText(state, directory, activeSessionId);
      const selectedAgent = state.selectedAgentByDirectory[directory] ?? null;
      const storedModel = state.selectedModelByDirectory[directory] ?? null;
      const storedVariant = state.selectedVariantByDirectory[directory] ?? null;

      set({
        baseUrl,
        directory,
        client,
        connection: getOpenCodeStatus(),
        contextItems,
        promptText,
        activeSessionId,
        selectedAgent,
      });

      const localClient = getDirectoryClient(directory, baseUrl);
      const sessionResult = await localClient.session.list({ directory }).catch(() => undefined);
      const sessionData = sessionResult ? unwrap(sessionResult) : undefined;
      const agentResult = await localClient.app.agents({ directory }).catch(() => undefined);
      const agentData = agentResult ? unwrap(agentResult) : undefined;
      const agents = agentData ?? state.agents;
      const selectedAgentResolved = resolveAgentName(agents, selectedAgent);
      const commandResult = await localClient.command.list({ directory }).catch(() => undefined);
      const commandData = commandResult ? unwrap(commandResult) : undefined;
      const commands = commandData ?? state.commands;
      const providerResult = await localClient.config.providers({ directory }).catch(() => undefined);
      const providerData = providerResult ? unwrap(providerResult) : undefined;
      const providers = providerData?.providers ?? state.providers;
      const providerDefaults = providerData?.default ?? state.providerDefaults;
      const storedModelResolved = storedModel ?? state.selectedModel;
      const selectedModelResolved = resolveModel(providers, providerDefaults, storedModelResolved);
      const selectedVariantResolved = resolveModelVariant(
        providers,
        selectedModelResolved,
        storedVariant ?? state.selectedVariant
      );
      const hasSessions = sessionData !== undefined;
      const sessions = hasSessions ? sessionData : [];
      const ids = hasSessions ? new Set(sessions.map((item) => item.id)) : new Set<string>();
      const nextActive = hasSessions && (!activeSessionId || !ids.has(activeSessionId))
        ? sessions[0]?.id ?? null
        : activeSessionId;

      set((prev) => {
        const sessionKey = getPromptKey(directory, nextActive);
        const pruned = prunePromptSessions(
          touchPromptSessions(prev.promptSessionOrder, [sessionKey]),
          prev.promptBySession,
          prev.contextBySession
        );
        const storedState = {
          ...prev,
          promptBySession: pruned.promptBySession,
          contextBySession: pruned.contextBySession,
        };
        return {
          ...(hasSessions
            ? {
                sessions,
                activeSessionId: nextActive,
                activeSessionByDirectory: {
                  ...prev.activeSessionByDirectory,
                  [directory]: nextActive,
                },
                contextItems: getStoredContextItems(storedState, directory, nextActive),
                promptText: getStoredPromptText(storedState, directory, nextActive),
              }
            : {}),
          agents,
          selectedAgent: selectedAgentResolved,
          selectedAgentByDirectory: {
            ...prev.selectedAgentByDirectory,
            [directory]: selectedAgentResolved,
          },
          commands,
          providers,
          providerDefaults,
          selectedModel: selectedModelResolved,
          selectedModelByDirectory: {
            ...prev.selectedModelByDirectory,
            [directory]: selectedModelResolved,
          },
          selectedVariant: selectedVariantResolved,
          selectedVariantByDirectory: {
            ...prev.selectedVariantByDirectory,
            [directory]: selectedVariantResolved,
          },
          promptSessionOrder: pruned.promptSessionOrder,
          promptBySession: pruned.promptBySession,
          contextBySession: pruned.contextBySession,
        };
      });

      if (hasSessions && nextActive) {
        await get().loadSessionMessages(nextActive);
      }

      unsubscribeStatus = onOpenCodeStatus((state) => {
        set({ connection: state, baseUrl: state.baseUrl });
      });

      unsubscribeEvents = onOpenCodeEvent(directory, (event, eventDirectory) => {
        get().applyEvent(event, eventDirectory);
      });
    },

    disconnect: () => {
      cleanupSubscriptions();
      set((state) => ({
        ...initialState,
        connection: getOpenCodeStatus(),
        contextBySession: state.contextBySession,
        promptBySession: state.promptBySession,
        promptSessionOrder: state.promptSessionOrder,
        activeSessionByDirectory: state.activeSessionByDirectory,
        selectedAgentByDirectory: state.selectedAgentByDirectory,
        selectedModelByDirectory: state.selectedModelByDirectory,
        selectedVariantByDirectory: state.selectedVariantByDirectory,
        modelVisibility: state.modelVisibility,
      }));
    },

    applyEvent: (event: Event, directory: OpenCodeDirectory) => {
      const currentDirectory = get().directory;
      if (!currentDirectory || currentDirectory !== directory) return;

      switch (event.type) {
        case 'session.created':
        case 'session.updated': {
          const session = event.properties.info;
          set((state) => ({
            sessions: upsertSession(state.sessions, session),
            activeSessionId: state.activeSessionId ?? session.id,
            activeSessionByDirectory: {
              ...state.activeSessionByDirectory,
              [directory]: state.activeSessionId ?? session.id,
            },
            ...(state.activeSessionId
              ? {}
              : {
                  contextItems: getStoredContextItems(state, directory, session.id),
                  promptText: getStoredPromptText(state, directory, session.id),
                }),
          }));
          break;
        }
        case 'session.deleted': {
          const session = event.properties.info;
          set((state) => {
            const nextSessions = removeSession(state.sessions, session.id);
            const nextActive = state.activeSessionId === session.id ? nextSessions[0]?.id ?? null : state.activeSessionId;
            const nextMessages = { ...state.messages };
            const nextMeta = { ...state.messageMeta };
            const nextStatus = { ...state.sessionStatus };
            const nextDiffs = { ...state.sessionDiffs };
            const nextTodos = { ...state.todos };
            const nextPermissions = { ...state.permissions };
            const nextQuestions = { ...state.questions };
            const nextErrors = { ...state.sessionErrors };
            const sessionKey = getPromptKey(directory, session.id);
            const nextPromptBySession = { ...state.promptBySession };
            const nextContextBySession = { ...state.contextBySession };
            delete nextPromptBySession[sessionKey];
            delete nextContextBySession[sessionKey];
            const pruned = prunePromptSessions(
              state.promptSessionOrder.filter((key) => key !== sessionKey),
              nextPromptBySession,
              nextContextBySession
            );
            const storedState = {
              ...state,
              promptBySession: pruned.promptBySession,
              contextBySession: pruned.contextBySession,
            };
            const nextContextItems = nextActive ? getStoredContextItems(storedState, directory, nextActive) : [];
            const nextPromptText = nextActive ? getStoredPromptText(storedState, directory, nextActive) : '';
            const nextActiveByDirectory = {
              ...state.activeSessionByDirectory,
              [directory]: nextActive,
            };

            delete nextMessages[session.id];
            delete nextMeta[session.id];
            delete nextStatus[session.id];
            delete nextDiffs[session.id];
            delete nextTodos[session.id];
            delete nextPermissions[session.id];
            delete nextQuestions[session.id];
            delete nextErrors[session.id];

            return {
              sessions: nextSessions,
              activeSessionId: nextActive,
              activeSessionByDirectory: nextActiveByDirectory,
              contextItems: nextContextItems,
              promptText: nextPromptText,
              messages: nextMessages,
              messageMeta: nextMeta,
              sessionStatus: nextStatus,
              sessionDiffs: nextDiffs,
              todos: nextTodos,
              permissions: nextPermissions,
              questions: nextQuestions,
              sessionErrors: nextErrors,
              promptBySession: pruned.promptBySession,
              contextBySession: pruned.contextBySession,
              promptSessionOrder: pruned.promptSessionOrder,
            };
          });
          break;
        }
        case 'session.status': {
          const { sessionID, status } = event.properties;
          set((state) => ({
            sessionStatus: {
              ...state.sessionStatus,
              [sessionID]: status,
            },
          }));
          break;
        }
        case 'session.diff': {
          const { sessionID, diff } = event.properties;
          set((state) => ({
            sessionDiffs: {
              ...state.sessionDiffs,
              [sessionID]: diff,
            },
          }));
          break;
        }
        case 'session.error': {
          const sessionID = event.properties.sessionID;
          if (!sessionID) break;
          const message = getSessionErrorMessage(event.properties.error);
          const authError = getProviderAuthError(event.properties.error);
          set((state) => ({
            sessionErrors: {
              ...state.sessionErrors,
              [sessionID]: message,
            },
            providerAuthErrors: authError
              ? {
                  ...state.providerAuthErrors,
                  [authError.data.providerID]: authError.data.message,
                }
              : state.providerAuthErrors,
          }));
          break;
        }
        case 'todo.updated': {
          const { sessionID, todos } = event.properties;
          set((state) => ({
            todos: {
              ...state.todos,
              [sessionID]: todos,
            },
          }));
          break;
        }
        case 'message.updated': {
          const info = event.properties.info;
          set((state) => {
            const list = state.messages[info.sessionID] ?? [];
            return {
              messages: {
                ...state.messages,
                [info.sessionID]: upsertMessage(list, info),
              },
            };
          });
          break;
        }
        case 'message.removed': {
          const { sessionID, messageID } = event.properties;
          set((state) => {
            const list = state.messages[sessionID] ?? [];
            const nextMessages = {
              ...state.messages,
              [sessionID]: removeById(list, messageID, (item) => item.id),
            };
            const nextParts = { ...state.parts };
            delete nextParts[messageID];
            return { messages: nextMessages, parts: nextParts };
          });
          break;
        }
        case 'message.part.updated': {
          const part = event.properties.part;
          set((state) => {
            const list = state.parts[part.messageID] ?? [];
            return {
              parts: {
                ...state.parts,
                [part.messageID]: insertSortedById(list, part, (item) => item.id),
              },
            };
          });
          break;
        }
        case 'message.part.removed': {
          const { messageID, partID } = event.properties;
          set((state) => {
            const list = state.parts[messageID];
            if (!list) return state;
            const nextList = removeById(list, partID, (item) => item.id);
            const nextParts = { ...state.parts };
            if (nextList.length === 0) {
              delete nextParts[messageID];
            } else {
              nextParts[messageID] = nextList;
            }
            return { parts: nextParts };
          });
          break;
        }
        case 'permission.asked': {
          const permission = event.properties;
          set((state) => {
            const list = state.permissions[permission.sessionID] ?? [];
            return {
              permissions: {
                ...state.permissions,
                [permission.sessionID]: insertSortedById(list, permission, (item) => item.id),
              },
            };
          });
          break;
        }
        case 'permission.replied': {
          const { sessionID, requestID } = event.properties;
          set((state) => {
            const list = state.permissions[sessionID] ?? [];
            return {
              permissions: {
                ...state.permissions,
                [sessionID]: removeById(list, requestID, (item) => item.id),
              },
            };
          });
          break;
        }
        case 'question.asked': {
          const question = event.properties;
          set((state) => {
            const list = state.questions[question.sessionID] ?? [];
            return {
              questions: {
                ...state.questions,
                [question.sessionID]: insertSortedById(list, question, (item) => item.id),
              },
            };
          });
          break;
        }
        case 'question.replied':
        case 'question.rejected': {
          const { sessionID, requestID } = event.properties;
          set((state) => {
            const list = state.questions[sessionID] ?? [];
            return {
              questions: {
                ...state.questions,
                [sessionID]: removeById(list, requestID, (item) => item.id),
              },
            };
          });
          break;
        }
        default:
          break;
      }
    },
    loadSessionMessages: async (sessionID: string, limit?: number) => {
      const state = get();
      const directory = state.directory;
      if (!directory) return;

      const meta = state.messageMeta[sessionID];
      if (meta?.loading) return;
      const nextLimit = limit ?? meta?.limit ?? DEFAULT_MESSAGE_LIMIT;

      set((prev) => ({
        messageMeta: {
          ...prev.messageMeta,
          [sessionID]: {
            limit: nextLimit,
            loading: true,
            hasMore: prev.messageMeta[sessionID]?.hasMore ?? true,
          },
        },
      }));

      const client = getDirectoryClient(directory, state.baseUrl);
      const response = await client.session
        .messages({ sessionID, directory, limit: nextLimit })
        .catch(() => undefined);
      const data = response ? unwrap(response) : undefined;
      if (!data) {
        set((prev) => ({
          messageMeta: {
            ...prev.messageMeta,
            [sessionID]: {
              limit: nextLimit,
              loading: false,
              hasMore: prev.messageMeta[sessionID]?.hasMore ?? false,
            },
          },
        }));
        return;
      }

      const hasMore = data.length === nextLimit;

      set((prev) => {
        const list = prev.messages[sessionID] ?? [];
        const nextList = data.reduce((acc, item) => upsertMessage(acc, item.info), list);
        const nextParts = { ...prev.parts };
        for (const item of data) {
          nextParts[item.info.id] = item.parts;
        }
        return {
          messages: {
            ...prev.messages,
            [sessionID]: nextList,
          },
          parts: nextParts,
          messageMeta: {
            ...prev.messageMeta,
            [sessionID]: {
              limit: nextLimit,
              loading: false,
              hasMore,
            },
          },
        };
      });
    },
    loadMoreMessages: async (sessionID: string) => {
      const meta = get().messageMeta[sessionID];
      const currentLimit = meta?.limit ?? DEFAULT_MESSAGE_LIMIT;
      const nextLimit = currentLimit + DEFAULT_MESSAGE_LIMIT;
      await get().loadSessionMessages(sessionID, nextLimit);
    },
    abortSession: async (sessionID?: string | null) => {
      const state = get();
      const directory = state.directory;
      const targetSession = sessionID ?? state.activeSessionId;
      if (!directory || !targetSession) return;
      const client = getDirectoryClient(directory, state.baseUrl);
      await client.session.abort({ sessionID: targetSession, directory }).catch(() => undefined);
    },
    undoSession: async () => {
      const state = get();
      const directory = state.directory;
      const sessionID = state.activeSessionId;
      if (!directory || !sessionID) {
        throw new Error('No active session to undo.');
      }
      const session = getSessionById(state.sessions, sessionID);
      const messages = state.messages[sessionID] ?? [];
      const target = findLastUserMessage(messages, session?.revert?.messageID);
      if (!target) {
        throw new Error('Nothing to undo.');
      }
      if (state.sessionStatus[sessionID]?.type !== 'idle') {
        await get().abortSession(sessionID).catch(() => undefined);
      }
      const client = getDirectoryClient(directory, state.baseUrl);
      await client.session.revert({ sessionID, messageID: target.id, directory });
    },
    redoSession: async () => {
      const state = get();
      const directory = state.directory;
      const sessionID = state.activeSessionId;
      if (!directory || !sessionID) {
        throw new Error('No active session to redo.');
      }
      const session = getSessionById(state.sessions, sessionID);
      const revertMessageID = session?.revert?.messageID;
      if (!revertMessageID) {
        throw new Error('Nothing to redo.');
      }
      const messages = state.messages[sessionID] ?? [];
      const nextMessage = findNextUserMessage(messages, revertMessageID);
      const client = getDirectoryClient(directory, state.baseUrl);
      if (!nextMessage) {
        await client.session.unrevert({ sessionID, directory });
        return;
      }
      await client.session.revert({ sessionID, messageID: nextMessage.id, directory });
    },
    compactSession: async () => {
      const state = get();
      const directory = state.directory;
      const sessionID = state.activeSessionId;
      if (!directory || !sessionID) {
        throw new Error('No active session to compact.');
      }
      const messages = state.messages[sessionID] ?? [];
      const hasUserMessages = messages.some((message) => message.role === 'user');
      if (!hasUserMessages) {
        throw new Error('Nothing to compact.');
      }
      let model = state.selectedModel;
      if (!model) {
        const storedSelection = state.selectedModelByDirectory[directory] ?? null;
        const resolved = resolveModel(state.providers, state.providerDefaults, storedSelection);
        if (resolved) {
          model = resolved;
          set((prev) => ({
            selectedModel: resolved,
            selectedModelByDirectory: {
              ...prev.selectedModelByDirectory,
              [directory]: resolved,
            },
          }));
        }
      }
      if (!model) {
        throw new Error('No model available for compaction.');
      }
      const client = getDirectoryClient(directory, state.baseUrl);
      await client.session.summarize({
        sessionID,
        providerID: model.providerID,
        modelID: model.modelID,
        directory,
      });
    },
    shareSession: async () => {
      const state = get();
      const directory = state.directory;
      const sessionID = state.activeSessionId;
      if (!directory || !sessionID) {
        throw new Error('No active session to share.');
      }
      const session = getSessionById(state.sessions, sessionID);
      if (session?.share?.url) {
        throw new Error('Session is already shared.');
      }
      const client = getDirectoryClient(directory, state.baseUrl);
      const shared = unwrap(await client.session.share({ sessionID, directory }));
      if (!shared) return null;
      return shared.share?.url ?? null;
    },
    unshareSession: async () => {
      const state = get();
      const directory = state.directory;
      const sessionID = state.activeSessionId;
      if (!directory || !sessionID) {
        throw new Error('No active session to unshare.');
      }
      const session = getSessionById(state.sessions, sessionID);
      if (!session?.share?.url) {
        throw new Error('Session is not currently shared.');
      }
      const client = getDirectoryClient(directory, state.baseUrl);
      await client.session.unshare({ sessionID, directory });
    },
    sendPrompt: async (input: PromptInputPayload) => {
      const state = get();
      const directory = state.directory;
      if (!directory) return;

      const mode = input.mode ?? 'prompt';
      const rawText = input.text;
      const trimmed = rawText.trim();
      const attachments = input.attachments ?? [];
      const contextItems = state.contextItems;
      if (!trimmed && attachments.length === 0 && contextItems.length === 0) return;

      const client = getDirectoryClient(directory, state.baseUrl);
      const sessionId = state.activeSessionId ?? null;
      const created = sessionId ? undefined : unwrap(await client.session.create({ directory }));
      const nextSessionId = sessionId ?? created?.id ?? null;
      if (!nextSessionId) return;

      if (created) {
        set((prev) => ({
          sessions: upsertSession(prev.sessions, created),
          activeSessionId: nextSessionId,
          activeSessionByDirectory: {
            ...prev.activeSessionByDirectory,
            [directory]: nextSessionId,
          },
        }));
      }

      if (!state.activeSessionId) {
        set((prev) => ({
          activeSessionId: nextSessionId,
          activeSessionByDirectory: {
            ...prev.activeSessionByDirectory,
            [directory]: nextSessionId,
          },
        }));
      }

      const resolvedAgent = resolveAgentName(state.agents, state.selectedAgent);
      if (!resolvedAgent) {
        const message = 'No agent available. Configure an agent in OpenCode to send messages.';
        set((prev) => ({
          sessionErrors: {
            ...prev.sessionErrors,
            [nextSessionId]: message,
          },
        }));
        throw new Error(message);
      }

      let resolvedModel = state.selectedModel;
      if (!resolvedModel) {
        const storedSelection = state.selectedModelByDirectory[directory] ?? null;
        const nextResolved = resolveModel(state.providers, state.providerDefaults, storedSelection);
        if (nextResolved) {
          resolvedModel = nextResolved;
          set((prev) => ({
            selectedModel: nextResolved,
            selectedModelByDirectory: {
              ...prev.selectedModelByDirectory,
              [directory]: nextResolved,
            },
          }));
        }
      }

      if (!resolvedModel && state.providers.length > 0) {
        const message = 'No model available. Configure a provider/model in OpenCode to send messages.';
        set((prev) => ({
          sessionErrors: {
            ...prev.sessionErrors,
            [nextSessionId]: message,
          },
        }));
        throw new Error(message);
      }

      const storedVariant = state.selectedVariantByDirectory[directory] ?? state.selectedVariant;
      const resolvedVariant = resolveModelVariant(state.providers, resolvedModel, storedVariant);

      const sessionKey = getPromptKey(directory, nextSessionId);
      const workspaceKey = getPromptKey(directory, null);
      const updateWorkspaceKey = state.activeSessionId === null && workspaceKey !== sessionKey;
      const previousPrompt = state.promptText;
      const commentItems = contextItems.filter((item) => item.comment?.trim());
      const nextContextItems = contextItems.filter((item) => !item.comment?.trim());

      if (mode === 'shell') {
        const command = trimmed.startsWith('!') ? trimmed.slice(1).trim() : trimmed;
        if (!command) return;
        set((prev) => {
          const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
          const nextPromptBySession = {
            ...prev.promptBySession,
            [sessionKey]: '',
            ...(updateWorkspaceKey ? { [workspaceKey]: '' } : {}),
          };
          const pruned = prunePromptSessions(
            touchPromptSessions(prev.promptSessionOrder, keys),
            nextPromptBySession,
            prev.contextBySession
          );
          return {
            promptText: '',
            promptBySession: pruned.promptBySession,
            contextBySession: pruned.contextBySession,
            promptSessionOrder: pruned.promptSessionOrder,
          };
        });
        try {
          const payload = {
            sessionID: nextSessionId,
            directory,
            command,
            agent: resolvedAgent,
            model: resolvedModel ?? undefined,
          } as any;
          if (resolvedVariant) payload.variant = resolvedVariant;
          await client.session.shell(payload);
        } catch (error) {
          const message = getSessionErrorMessage(error);
          set((prev) => {
            const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
            const nextPromptBySession = {
              ...prev.promptBySession,
              [sessionKey]: previousPrompt,
              ...(updateWorkspaceKey ? { [workspaceKey]: previousPrompt } : {}),
            };
            const pruned = prunePromptSessions(
              touchPromptSessions(prev.promptSessionOrder, keys),
              nextPromptBySession,
              prev.contextBySession
            );
            return {
              promptText: previousPrompt,
              promptBySession: pruned.promptBySession,
              contextBySession: pruned.contextBySession,
              promptSessionOrder: pruned.promptSessionOrder,
              sessionErrors: {
                ...prev.sessionErrors,
                [nextSessionId]: message,
              },
            };
          });
          throw error;
        }
        return;
      }

      if (trimmed.startsWith('/')) {
        const [commandName, ...args] = trimmed.slice(1).split(/\s+/);
        const command = state.commands.find((item) => item.name === commandName);
        if (command) {
          const commandParts = attachments.map((attachment) => ({
            id: createPartId(),
            type: 'file' as const,
            mime: attachment.mime,
            filename: attachment.filename,
            url: attachment.url,
          }));
          set((prev) => {
            const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
            const nextPromptBySession = {
              ...prev.promptBySession,
              [sessionKey]: '',
              ...(updateWorkspaceKey ? { [workspaceKey]: '' } : {}),
            };
            const pruned = prunePromptSessions(
              touchPromptSessions(prev.promptSessionOrder, keys),
              nextPromptBySession,
              prev.contextBySession
            );
            return {
              promptText: '',
              promptBySession: pruned.promptBySession,
              contextBySession: pruned.contextBySession,
              promptSessionOrder: pruned.promptSessionOrder,
            };
          });
          try {
            const payload = {
              sessionID: nextSessionId,
              directory,
              command: commandName,
              arguments: args.join(' '),
              agent: resolvedAgent,
              model: resolvedModel ? `${resolvedModel.providerID}/${resolvedModel.modelID}` : undefined,
              parts: commandParts.length > 0 ? commandParts : undefined,
            } as any;
            if (resolvedVariant) payload.variant = resolvedVariant;
            await client.session.command(payload);
          } catch (error) {
            const message = getSessionErrorMessage(error);
            set((prev) => {
              const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
              const nextPromptBySession = {
                ...prev.promptBySession,
                [sessionKey]: previousPrompt,
                ...(updateWorkspaceKey ? { [workspaceKey]: previousPrompt } : {}),
              };
              const pruned = prunePromptSessions(
                touchPromptSessions(prev.promptSessionOrder, keys),
                nextPromptBySession,
                prev.contextBySession
              );
              return {
                promptText: previousPrompt,
                promptBySession: pruned.promptBySession,
                contextBySession: pruned.contextBySession,
                promptSessionOrder: pruned.promptSessionOrder,
                sessionErrors: {
                  ...prev.sessionErrors,
                  [nextSessionId]: message,
                },
              };
            });
            throw error;
          }
        return;
      }
      }

      set((prev) => {
        const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
        const nextPromptBySession = {
          ...prev.promptBySession,
          [sessionKey]: '',
          ...(updateWorkspaceKey ? { [workspaceKey]: '' } : {}),
        };
        const nextContextBySession = {
          ...prev.contextBySession,
          [sessionKey]: nextContextItems,
          ...(updateWorkspaceKey ? { [workspaceKey]: nextContextItems } : {}),
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(prev.promptSessionOrder, keys),
          nextPromptBySession,
          nextContextBySession
        );
        return {
          promptText: '',
          promptBySession: pruned.promptBySession,
          contextItems: nextContextItems,
          contextBySession: pruned.contextBySession,
          promptSessionOrder: pruned.promptSessionOrder,
        };
      });

      const messageId = createMessageId();
      const textPartId = createPartId();
      const textPart: TextPartInput = {
        id: textPartId,
        type: 'text',
        text: rawText,
      };

      const inline = resolveInlineReferences(rawText, contextItems, state.agents);
      const fileAttachmentParts = inline.fileRefs.map((ref) => {
        const name = ref.path.split(/[/\\]/).pop() || ref.path;
        const absolute = resolveAbsolutePath(directory, ref.path);
        return {
          id: createPartId(),
          type: 'file' as const,
          mime: 'text/plain',
          url: buildFileUrl(directory, ref.path, ref.selection),
          filename: name,
          source: {
            type: 'file' as const,
            path: absolute,
            text: {
              value: ref.value,
              start: ref.start,
              end: ref.end,
            },
          },
        };
      });

      const usedUrls = new Set(fileAttachmentParts.map((part) => part.url));
      const contextParts: Array<TextPartInput | FilePartInput> = [];

      const commentNote = (path: string, selection: PromptSelection | undefined, comment: string) => {
        const start = selection ? Math.min(selection.startLine, selection.endLine) : undefined;
        const end = selection ? Math.max(selection.startLine, selection.endLine) : undefined;
        const range =
          start === undefined || end === undefined
            ? 'this file'
            : start === end
              ? `line ${start}`
              : `lines ${start} through ${end}`;

        return `The user made the following comment regarding ${range} of ${path}: ${comment}`;
      };

      const addContextFile = (item: PromptContextItem) => {
        const url = buildFileUrl(directory, item.path, item.selection);
        const comment = item.comment?.trim();
        if (!comment && usedUrls.has(url)) return;
        usedUrls.add(url);
        const name = item.path.split(/[/\\]/).pop() || item.path;

        if (comment) {
          contextParts.push({
            id: createPartId(),
            type: 'text',
            text: commentNote(item.path, item.selection, comment),
            synthetic: true,
          });
        }

        contextParts.push({
          id: createPartId(),
          type: 'file',
          mime: 'text/plain',
          filename: name,
          url,
        });
      };

      for (const item of contextItems) {
        addContextFile(item);
      }

      const agentAttachmentParts = inline.agentRefs.map((ref) => ({
        id: createPartId(),
        type: 'agent' as const,
        name: ref.name,
        source: {
          value: ref.value,
          start: ref.start,
          end: ref.end,
        },
      }));

      const imageAttachmentParts = attachments.map((attachment) => ({
        id: createPartId(),
        type: 'file' as const,
        mime: attachment.mime,
        filename: attachment.filename,
        url: attachment.url,
      }));

      const requestParts: Array<TextPartInput | FilePartInput | AgentPartInput> = [
        textPart,
        ...fileAttachmentParts,
        ...contextParts,
        ...agentAttachmentParts,
        ...imageAttachmentParts,
      ];

      const optimisticParts = requestParts.map((part) => ({
        ...part,
        sessionID: nextSessionId,
        messageID: messageId,
      })) as Part[];

      const optimisticMessage: Message = {
        id: messageId,
        sessionID: nextSessionId,
        role: 'user',
        time: { created: Date.now() },
        agent: resolvedAgent,
        model: resolvedModel ?? { providerID: 'unknown', modelID: 'unknown' },
      };

      set((prev) => {
        const list = prev.messages[nextSessionId] ?? [];
        return {
          messages: {
            ...prev.messages,
            [nextSessionId]: upsertMessage(list, optimisticMessage),
          },
          parts: {
            ...prev.parts,
            [messageId]: optimisticParts
              .filter((part) => !!part?.id)
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id)),
          },
        };
      });

      // Fire-and-forget prompt like OpenCode app does
      // All updates come via SSE events, not the response body
      void (async () => {
        try {
          const payload = {
            sessionID: nextSessionId,
            directory,
            messageID: messageId,
            parts: requestParts,
            agent: resolvedAgent,
            model: resolvedModel ?? undefined,
          } as any;
          if (resolvedVariant) payload.variant = resolvedVariant;
          await client.session.prompt(payload);
        } catch (error) {
          const message = getSessionErrorMessage(error);
          const authError = getProviderAuthError(error);
          set((prev) => {
            const list = prev.messages[nextSessionId] ?? [];
            const nextMessages = {
              ...prev.messages,
              [nextSessionId]: removeMessage(list, messageId),
            };
            const nextParts = { ...prev.parts };
            delete nextParts[messageId];
            const restoredContext = [...nextContextItems, ...commentItems];
            const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
            const nextPromptBySession = {
              ...prev.promptBySession,
              [sessionKey]: previousPrompt,
              ...(updateWorkspaceKey ? { [workspaceKey]: previousPrompt } : {}),
            };
            const nextContextBySession = {
              ...prev.contextBySession,
              [sessionKey]: restoredContext,
              ...(updateWorkspaceKey ? { [workspaceKey]: restoredContext } : {}),
            };
            const pruned = prunePromptSessions(
              touchPromptSessions(prev.promptSessionOrder, keys),
              nextPromptBySession,
              nextContextBySession
            );
            return {
              messages: nextMessages,
              parts: nextParts,
              promptText: previousPrompt,
              promptBySession: pruned.promptBySession,
              contextItems: restoredContext,
              contextBySession: pruned.contextBySession,
              promptSessionOrder: pruned.promptSessionOrder,
              sessionErrors: {
                ...prev.sessionErrors,
                [nextSessionId]: message,
              },
              providerAuthErrors: authError
                ? {
                    ...prev.providerAuthErrors,
                    [authError.data.providerID]: authError.data.message,
                  }
                : prev.providerAuthErrors,
            };
          });
        }
      })();
    },
      }),
      {
        name: 'cushion-chat',
        version: 3,
        partialize: (state) => ({
          baseUrl: state.baseUrl,
          contextBySession: state.contextBySession,
          promptBySession: state.promptBySession,
          promptSessionOrder: state.promptSessionOrder,
          activeSessionByDirectory: state.activeSessionByDirectory,
          selectedAgentByDirectory: state.selectedAgentByDirectory,
          selectedModelByDirectory: state.selectedModelByDirectory,
          selectedVariantByDirectory: state.selectedVariantByDirectory,
          modelVisibility: state.modelVisibility,
        }),
        migrate: (state, version) => {
          if (!state || typeof state !== 'object') return state as ChatState;
          if (version >= 3) return state as ChatState;
          const legacy = state as ChatState & {
            contextByDirectory?: Record<string, PromptContextItem[]>;
            promptSessionOrder?: string[];
          };
          const contextBySession: Record<string, PromptContextItem[]> = { ...legacy.contextBySession };

          if (version < 2 && legacy.contextByDirectory) {
            for (const [directory, items] of Object.entries(legacy.contextByDirectory)) {
              const key = getPromptKey(directory, null);
              if (!contextBySession[key]) {
                contextBySession[key] = items;
              }
            }
          }

          const promptBySession = legacy.promptBySession ?? {};
          const promptSessionOrder = legacy.promptSessionOrder
            ?? Array.from(new Set([...Object.keys(promptBySession), ...Object.keys(contextBySession)]));
          const pruned = prunePromptSessions(promptSessionOrder, promptBySession, contextBySession);

          return {
            ...legacy,
            contextBySession: pruned.contextBySession,
            promptBySession: pruned.promptBySession,
            promptSessionOrder: pruned.promptSessionOrder,
          } as ChatState;
        },
      }
    )
  )
);
