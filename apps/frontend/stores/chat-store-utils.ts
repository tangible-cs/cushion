import type {
  Command,
  Event,
  Agent,
  Provider,
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
  FileDiff,
} from '@opencode-ai/sdk/v2/client';
import { createOpenCodeClient } from '@/lib/opencode-client';
import type { OpenCodeClient } from '@/lib/opencode-client';
import {
  getOpenCodeStatus,
  type OpenCodeConnectionState,
} from '@/lib/shared-opencode-client';
import type { PromptPart } from '@/lib/prompt-dom';

// Types

export type OpenCodeDirectory = string;

export type ModelVisibility = 'show' | 'hide';

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

export type PromptInputPayload = {
  text: string;
  parts: PromptPart[];
  attachments?: PromptAttachment[];
  mode?: 'prompt' | 'shell';
};

export type MessageMeta = {
  limit: number;
  loading: boolean;
  hasMore: boolean;
};

export type SelectedModel = {
  providerID: string;
  modelID: string;
};

export type DisplayPreferences = {
  showThinking: boolean;
  shellToolPartsExpanded: boolean;
  editToolPartsExpanded: boolean;
};

export type CurrentFileContext = {
  path: string;
  enabled: boolean;
};

export type ChatState = {
  baseUrl: string;
  directory: OpenCodeDirectory | null;
  client: OpenCodeClient | null;
  connection: OpenCodeConnectionState;
  activeSessionId: string | null;
  promptText: string;
  promptParts: PromptPart[];
  displayPreferences: DisplayPreferences;
  currentFileContext: CurrentFileContext | null;
  includeCurrentFile: boolean;
  /** Tracks the last file path sent per session so we only send on file switch */
  lastSentFilePath: Record<string, string | null>;
  promptBySession: Record<string, PromptPart[]>;
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
  compactedSessions: Record<string, boolean>;
  reviewMode: boolean;
  /** Sessions currently being aborted (prevents double-abort, drives UI) */
  abortingSessions: Record<string, boolean>;
  /** Queued prompt to send after current session aborts (interrupt-and-send) */
  pendingInterrupt: { sessionID: string; payload: PromptInputPayload } | null;
  /** All skill names discovered by OpenCode (refreshed on connect) */
  allSkillNames: string[];
  /** Skill names that the user has disabled */
  disabledSkills: string[];
};

export type ChatActions = {
  connect: (directory: OpenCodeDirectory) => Promise<void>;
  disconnect: () => void;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  applyEvent: (event: Event, directory: OpenCodeDirectory) => void;
  sendPrompt: (input: PromptInputPayload) => Promise<void>;
  loadSessionMessages: (sessionID: string, limit?: number) => Promise<void>;
  loadMoreMessages: (sessionID: string) => Promise<void>;
  setPromptText: (text: string) => void;
  setPromptParts: (parts: PromptPart[]) => void;
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
  syncCurrentFile: (path: string | null) => void;
  toggleIncludeCurrentFile: () => void;
  toggleShowThinking: () => void;
  toggleShellToolPartsExpanded: () => void;
  toggleEditToolPartsExpanded: () => void;
  toggleReviewMode: () => void;
  setSkillDisabled: (name: string, disabled: boolean) => void;
};

export type ChatStore = ChatState & ChatActions;

export type ChatStoreGet = () => ChatStore;
export type ChatStoreSet = (
  updater: Partial<ChatState> | ((state: ChatStore) => Partial<ChatState>)
) => void;

// Constants

export const DEFAULT_MESSAGE_LIMIT = 200;
const WORKSPACE_SESSION_KEY = '__workspace__';
export const MAX_PROMPT_SESSIONS = 20;

// Initial state

const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  showThinking: false,
  shellToolPartsExpanded: false,
  editToolPartsExpanded: false,
};

export const initialState: ChatState = {
  baseUrl: getOpenCodeStatus().baseUrl,
  directory: null,
  client: null,
  connection: getOpenCodeStatus(),
  activeSessionId: null,
  promptText: '',
  promptParts: [],
  displayPreferences: DEFAULT_DISPLAY_PREFERENCES,
  currentFileContext: null,
  includeCurrentFile: true,
  lastSentFilePath: {},
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
  compactedSessions: {},
  reviewMode: false,
  abortingSessions: {},
  pendingInterrupt: null,
  allSkillNames: [],
  disabledSkills: [],
};

// List utilities

export function insertSortedById<T>(list: T[], item: T, getId: (value: T) => string) {
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

export function removeById<T>(list: T[], id: string, getId: (value: T) => string) {
  const index = list.findIndex((item) => getId(item) === id);
  if (index < 0) return list;
  const next = list.slice();
  next.splice(index, 1);
  return next;
}

export function upsertSession(list: Session[], session: Session) {
  const next = insertSortedById(list, session, (item) => item.id);
  return next.slice().sort((a, b) => b.time.updated - a.time.updated);
}

export function removeSession(list: Session[], sessionId: string) {
  return list.filter((session) => session.id !== sessionId);
}

export function upsertMessage(list: Message[], message: Message) {
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

export function removeMessage(list: Message[], messageId: string) {
  return list.filter((item) => item.id !== messageId);
}

// Prompt session utilities

export function getPromptKey(directory: string, sessionId: string | null) {
  const normalized = directory.replace(/\\/g, '/');
  return `${normalized}::${sessionId ?? WORKSPACE_SESSION_KEY}`;
}

export function getStoredPromptParts(
  state: Pick<ChatState, 'promptBySession'>,
  directory: string,
  sessionId: string | null
): PromptPart[] {
  const key = getPromptKey(directory, sessionId);
  return state.promptBySession[key] ?? [];
}

export function getStoredPromptText(
  state: Pick<ChatState, 'promptBySession'>,
  directory: string,
  sessionId: string | null
) {
  return getStoredPromptParts(state, directory, sessionId)
    .map((p) => p.content)
    .join('');
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

export function touchPromptSessions(order: string[], keys: string[]) {
  return keys.reduce((current, key) => touchPromptSession(current, key), order);
}

export function prunePromptSessions(
  order: string[],
  promptBySession: Record<string, PromptPart[]>
) {
  if (order.length <= MAX_PROMPT_SESSIONS) {
    return { promptSessionOrder: order, promptBySession };
  }
  const promptSessionOrder = order.slice(-MAX_PROMPT_SESSIONS);
  const keep = new Set(promptSessionOrder);
  const nextPrompt = Object.fromEntries(
    Object.entries(promptBySession).filter(([key]) => keep.has(key))
  );
  return {
    promptSessionOrder,
    promptBySession: nextPrompt,
  };
}

// Model visibility

export function getModelVisibilityKey(model: SelectedModel) {
  return `${model.providerID}:${model.modelID}`;
}

export function resolveModelVisibility(map: Record<string, ModelVisibility>, model: SelectedModel) {
  const state = map[getModelVisibilityKey(model)];
  if (state === 'hide') return false;
  return true;
}

// API helpers

type ResultData<T> = { data: T };

export function unwrap<T>(result: T | ResultData<T>): T {
  if (typeof result === 'object' && result !== null && 'data' in result) {
    return (result as ResultData<T>).data;
  }
  return result as T;
}

export function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return getOpenCodeStatus().baseUrl;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.replace(/\/+$/, '');
}

export function isValidBaseUrl(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getDirectoryClient(directory: string, baseUrl?: string) {
  const resolved = baseUrl ? normalizeBaseUrl(baseUrl) : getOpenCodeStatus().baseUrl;
  return createOpenCodeClient({ baseUrl: resolved, directory, throwOnError: true });
}
