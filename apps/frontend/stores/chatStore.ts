
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { getOpenCodeStatus } from '@/lib/shared-opencode-client';
import {
  createContextId,
  sameSelection,
  resolveModel,
  resolveModelVariant,
} from '@/lib/chat-helpers';
import { wrapSdk } from '@/lib/sdk-result';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { handleApplyEvent } from './chat-event-handler';
import { handleSendPrompt } from './chat-send-prompt';
import { handleConnect, handleDisconnect } from './chat-connection';
import {
  handleSetActiveSession,
  handleLoadSessionMessages,
  handleLoadMoreMessages,
  handleAbortSession,
  handleUndoSession,
  handleRedoSession,
  handleCompactSession,
  handleShareSession,
  handleUnshareSession,
} from './chat-session-actions';
import {
  type OpenCodeDirectory,
  type ModelVisibility,
  type ChatState,
  type ChatActions,
  type PromptContextItem,
  type SelectedModel,
  MAX_CONTEXT_ITEMS,
  initialState,
  getPromptKey,
  getStoredPromptText,
  getStoredContextItems,
  touchPromptSessions,
  prunePromptSessions,
  getModelVisibilityKey,
  resolveModelVisibility,
  getDirectoryClient,
  unwrap,
  normalizeBaseUrl,
  isValidBaseUrl,
} from './chat-store-utils';

export type { PromptAttachment, PromptSelection, PromptContextItem, PromptInputPayload, SelectedModel, DisplayPreferences } from './chat-store-utils';

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
      const coordinator = await getSharedCoordinatorClient();
      const result = await wrapSdk(() =>
        coordinator.authorizeOAuth({ providerID, method: 0 })
      );
      if (!result.ok) {
        set((state) => ({
          providerAuthErrors: {
            ...state.providerAuthErrors,
            [providerID]: result.error.message,
          },
        }));
        return null;
      }
      return result.data.url ?? null;
    },

    refreshProviders: async () => {
      const directory = get().directory;
      if (!directory) return;
      const coordinator = await getSharedCoordinatorClient();
      await coordinator.syncProviders().catch(() => undefined);
      const client = getDirectoryClient(directory, get().baseUrl);
      await wrapSdk(() => client.instance.dispose());
      const result = await wrapSdk(() =>
        client.config.providers({ directory }).then(unwrap)
      );
      if (!result.ok) return;
      const providerData = result.data;
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
      if (!isValidBaseUrl(next)) {
        throw new Error('OpenCode URL must be a valid http(s) URL.');
      }
      if (next === get().baseUrl) return;
      set({ baseUrl: next });
      const directory = get().directory;
      if (!directory) return;
      await get().connect(directory);
    },

    connect: (directory) => handleConnect(directory, get, set),
    disconnect: () => handleDisconnect(get, set),
    applyEvent: (event, directory) => handleApplyEvent(event, directory, get, set),
    setActiveSession: (sessionID) => handleSetActiveSession(sessionID, get, set),
    loadSessionMessages: (sessionID, limit?) => handleLoadSessionMessages(sessionID, get, set, limit),
    loadMoreMessages: (sessionID) => handleLoadMoreMessages(sessionID, get, set),
    abortSession: (sessionID?) => handleAbortSession(get, set, sessionID),
    undoSession: () => handleUndoSession(get, set),
    redoSession: () => handleRedoSession(get, set),
    compactSession: () => handleCompactSession(get, set),
    shareSession: () => handleShareSession(get, set),
    unshareSession: () => handleUnshareSession(get, set),
    sendPrompt: (input) => handleSendPrompt(input, get, set),

    toggleShowThinking: () => {
      set((state) => ({
        displayPreferences: {
          ...state.displayPreferences,
          showThinking: !state.displayPreferences.showThinking,
        },
      }));
    },

    toggleShellToolPartsExpanded: () => {
      set((state) => ({
        displayPreferences: {
          ...state.displayPreferences,
          shellToolPartsExpanded: !state.displayPreferences.shellToolPartsExpanded,
        },
      }));
    },

    toggleEditToolPartsExpanded: () => {
      set((state) => ({
        displayPreferences: {
          ...state.displayPreferences,
          editToolPartsExpanded: !state.displayPreferences.editToolPartsExpanded,
        },
      }));
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
          displayPreferences: state.displayPreferences,
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
