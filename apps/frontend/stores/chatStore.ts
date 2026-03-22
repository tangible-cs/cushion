
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { getOpenCodeStatus } from '@/lib/shared-opencode-client';
import {
  resolveModel,
  resolveModelVariant,
} from '@/lib/chat-helpers';
import { wrapSdk } from '@/lib/sdk-result';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { useDiffReviewStore } from './diffReviewStore';
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
  type SelectedModel,
  initialState,
  getPromptKey,
  getStoredPromptText,
  touchPromptSessions,
  prunePromptSessions,
  getModelVisibilityKey,
  resolveModelVisibility,
  getDirectoryClient,
  unwrap,
  normalizeBaseUrl,
  isValidBaseUrl,
} from './chat-store-utils';

export type { PromptAttachment, PromptSelection, PromptInputPayload, SelectedModel, DisplayPreferences, CurrentFileContext } from './chat-store-utils';


export const useChatStore = create<ChatState & ChatActions>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

    setPromptText: (text: string) => {
      const parts = [{ type: 'text' as const, content: text, start: 0, end: text.length }];
      get().setPromptParts(parts);
    },

    setPromptParts: (parts) => {
      const text = parts.map((p) => p.content).join('');
      set((state) => {
        const directory = state.directory;
        if (!directory) return { promptText: text, promptParts: parts };
        const sessionKey = getPromptKey(directory, state.activeSessionId);
        const nextPromptBySession = {
          ...state.promptBySession,
          [sessionKey]: parts,
        };
        const pruned = prunePromptSessions(
          touchPromptSessions(state.promptSessionOrder, [sessionKey]),
          nextPromptBySession
        );
        return {
          promptText: text,
          promptParts: parts,
          promptBySession: pruned.promptBySession,
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

    syncCurrentFile: (path: string | null) => {
      if (!path || path === '__new_tab__') {
        set({ currentFileContext: null });
        return;
      }
      set((state) => ({
        currentFileContext: { path, enabled: state.includeCurrentFile },
      }));
    },

    toggleIncludeCurrentFile: () => {
      set((state) => {
        const next = !state.includeCurrentFile;
        return {
          includeCurrentFile: next,
          currentFileContext: state.currentFileContext
            ? { ...state.currentFileContext, enabled: next }
            : null,
        };
      });
    },

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

    toggleAutoAccept: () => {
      const next = !get().autoAccept;
      set({ autoAccept: next });
      if (next) {
        // Switching ON: clear snapshots + exit any active review (no review desired)
        const diffStore = useDiffReviewStore.getState();
        diffStore.clearSnapshots();
        if (diffStore.reviewingFilePath) {
          diffStore.finishReview();
        }
      }
      // Switching OFF: no action needed — snapshots will be captured on next edit permission
    },
      }),
      {
        name: 'cushion-chat',
        version: 6,
        partialize: (state) => ({
          baseUrl: state.baseUrl,
          promptBySession: state.promptBySession,
          promptSessionOrder: state.promptSessionOrder,
          activeSessionByDirectory: state.activeSessionByDirectory,
          selectedAgentByDirectory: state.selectedAgentByDirectory,
          selectedModelByDirectory: state.selectedModelByDirectory,
          selectedVariantByDirectory: state.selectedVariantByDirectory,
          modelVisibility: state.modelVisibility,
          displayPreferences: state.displayPreferences,
          includeCurrentFile: state.includeCurrentFile,
          autoAccept: state.autoAccept,
        }),
        migrate: (state, version) => {
          if (!state || typeof state !== 'object') return state as ChatState;
          if (version >= 6) return state as ChatState;
          // v5 → v6: drop contextItems / contextBySession (now inline pills)
          if (version === 5) {
            const legacy = state as Record<string, unknown>;
            const { contextItems: _, contextBySession: __, ...rest } = legacy;
            return rest as ChatState;
          }
          if (version === 4) {
            const legacy = state as ChatState & { promptBySession?: Record<string, string | unknown[]> };
            const oldMap = legacy.promptBySession ?? {};
            const newMap: Record<string, unknown[]> = {};
            for (const [key, value] of Object.entries(oldMap)) {
              if (typeof value === 'string') {
                newMap[key] = value
                  ? [{ type: 'text', content: value, start: 0, end: value.length }]
                  : [];
              } else {
                newMap[key] = value as unknown[];
              }
            }
            return { ...legacy, promptBySession: newMap, autoAccept: (legacy as Record<string, unknown>).autoAccept ?? false } as ChatState;
          }
          if (version === 3) {
            return { ...state, autoAccept: false, promptBySession: {} } as ChatState;
          }
          // v0-v2: wipe old data
          return { ...(state as Record<string, unknown>), promptBySession: {}, promptSessionOrder: [] } as unknown as ChatState;
        },
      }
    )
  )
);
