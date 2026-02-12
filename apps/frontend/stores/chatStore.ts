'use client';

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import {
  getOpenCodeStatus,
  getSharedOpenCodeClient,
  onOpenCodeEvent,
  onOpenCodeStatus,
} from '@/lib/shared-opencode-client';
import {
  createContextId,
  sameSelection,
  resolveModel,
  resolveModelVariant,
  resolveAgentName,
  getSessionById,
  findLastUserMessage,
  findNextUserMessage,
} from '@/lib/chat-helpers';
import { handleApplyEvent } from './chat-event-handler';
import { handleSendPrompt } from './chat-send-prompt';
import {
  type OpenCodeDirectory,
  type ModelVisibility,
  type ChatState,
  type ChatActions,
  type PromptContextItem,
  type SelectedModel,
  MAX_CONTEXT_ITEMS,
  DEFAULT_MESSAGE_LIMIT,
  getPromptKey,
  getStoredPromptText,
  getStoredContextItems,
  touchPromptSessions,
  prunePromptSessions,
  getModelVisibilityKey,
  resolveModelVisibility,
  upsertMessage,
  unwrap,
  normalizeBaseUrl,
  getDirectoryClient,
} from './chat-store-utils';

export type { PromptAttachment, PromptSelection, PromptContextItem, PromptInputPayload, SelectedModel } from './chat-store-utils';

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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

    applyEvent: (event, directory) => handleApplyEvent(event, directory, get, set),

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

    sendPrompt: (input) => handleSendPrompt(input, get, set),
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

