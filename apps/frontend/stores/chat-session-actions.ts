import {
  getSessionById,
  findLastUserMessage,
  findNextUserMessage,
  resolveModel,
} from '@/lib/chat-helpers';
import {
  type ChatStoreGet,
  type ChatStoreSet,
  DEFAULT_MESSAGE_LIMIT,
  getPromptKey,
  getStoredPromptParts,
  getStoredPromptText,
  touchPromptSessions,
  prunePromptSessions,
  getDirectoryClient,
  upsertMessage,
  unwrap,
} from './chat-store-utils';

export async function handleSetActiveSession(
  sessionID: string | null,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
  const directory = get().directory;
  if (!directory) return;
  set((state) => {
    const sessionKey = getPromptKey(directory, sessionID);
    const pruned = prunePromptSessions(
      touchPromptSessions(state.promptSessionOrder, [sessionKey]),
      state.promptBySession
    );
    const storedState = {
      ...state,
      promptBySession: pruned.promptBySession,
    };
    return {
      activeSessionId: sessionID,
      activeSessionByDirectory: {
        ...state.activeSessionByDirectory,
        [directory]: sessionID,
      },
      promptParts: getStoredPromptParts(storedState, directory, sessionID),
      promptText: getStoredPromptText(storedState, directory, sessionID),
      promptBySession: pruned.promptBySession,
      promptSessionOrder: pruned.promptSessionOrder,
    };
  });
  if (sessionID && !get().messages[sessionID]) {
    await get().loadSessionMessages(sessionID);
  }
}

export async function handleLoadSessionMessages(
  sessionID: string,
  get: ChatStoreGet,
  set: ChatStoreSet,
  limit?: number
) {
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
}

export async function handleLoadMoreMessages(
  sessionID: string,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
  const meta = get().messageMeta[sessionID];
  const currentLimit = meta?.limit ?? DEFAULT_MESSAGE_LIMIT;
  const nextLimit = currentLimit + DEFAULT_MESSAGE_LIMIT;
  await handleLoadSessionMessages(sessionID, get, set, nextLimit);
}

export async function handleAbortSession(
  get: ChatStoreGet,
  set: ChatStoreSet,
  sessionID?: string | null
) {
  const state = get();
  const directory = state.directory;
  const targetSession = sessionID ?? state.activeSessionId;
  if (!directory || !targetSession) return;

  // Double-abort guard: if already aborting this session, skip
  if (state.abortingSessions[targetSession]) return;

  // Set aborting flag (cleared when SSE session.status → idle fires)
  set({
    abortingSessions: { ...state.abortingSessions, [targetSession]: true },
  });

  const client = getDirectoryClient(directory, state.baseUrl);
  await client.session.abort({ sessionID: targetSession, directory }).catch(() => undefined);
}

export async function handleUndoSession(get: ChatStoreGet, set: ChatStoreSet) {
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
}

export async function handleRedoSession(get: ChatStoreGet, set: ChatStoreSet) {
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
}

export async function handleCompactSession(get: ChatStoreGet, set: ChatStoreSet) {
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
  set((prev) => ({
    compactedSessions: { ...prev.compactedSessions, [sessionID]: true },
  }));
}

export async function handleShareSession(
  get: ChatStoreGet,
  set: ChatStoreSet
): Promise<string | null> {
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
}

export async function handleUnshareSession(get: ChatStoreGet, set: ChatStoreSet) {
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
}
