import type { TextPartInput, FilePartInput, AgentPartInput, Part, Message } from '@opencode-ai/sdk/v2/client';
import {
  createMessageId,
  createPartId,
  resolveAgentName,
  resolveModel,
  resolveModelVariant,
  resolveAbsolutePath,
  buildFileUrl,
} from '@/lib/chat-helpers';
import type { PromptPart } from '@/lib/prompt-dom';
import { wrapSdk, mapSdkError } from '@/lib/sdk-result';
import {
  type PromptInputPayload,
  type ChatStoreGet,
  type ChatStoreSet,
  upsertSession,
  upsertMessage,
  removeMessage,
  getPromptKey,
  touchPromptSessions,
  prunePromptSessions,
  getDirectoryClient,
  unwrap,
} from './chat-store-utils';
import { handleAbortSession } from './chat-session-actions';

/** Clear the prompt from state, returning the values needed to restore on error. */
function clearPrompt(
  set: ChatStoreSet,
  sessionKey: string,
  workspaceKey: string,
  updateWorkspaceKey: boolean
) {
  set((prev) => {
    const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
    const nextPromptBySession = {
      ...prev.promptBySession,
      [sessionKey]: [] as PromptPart[],
      ...(updateWorkspaceKey ? { [workspaceKey]: [] as PromptPart[] } : {}),
    };
    const pruned = prunePromptSessions(
      touchPromptSessions(prev.promptSessionOrder, keys),
      nextPromptBySession
    );
    return {
      promptText: '',
      promptParts: [],
      promptBySession: pruned.promptBySession,
      promptSessionOrder: pruned.promptSessionOrder,
    };
  });
}

/** Restore the prompt in state and record the session error. */
function restorePrompt(
  set: ChatStoreSet,
  sessionKey: string,
  workspaceKey: string,
  updateWorkspaceKey: boolean,
  previousPrompt: string,
  previousParts: PromptPart[],
  sessionId: string,
  errorMessage: string
) {
  set((prev) => {
    const keys = updateWorkspaceKey ? [sessionKey, workspaceKey] : [sessionKey];
    const nextPromptBySession = {
      ...prev.promptBySession,
      [sessionKey]: previousParts,
      ...(updateWorkspaceKey ? { [workspaceKey]: previousParts } : {}),
    };
    const pruned = prunePromptSessions(
      touchPromptSessions(prev.promptSessionOrder, keys),
      nextPromptBySession
    );
    return {
      promptText: previousPrompt,
      promptParts: previousParts,
      promptBySession: pruned.promptBySession,
      promptSessionOrder: pruned.promptSessionOrder,
      sessionErrors: {
        ...prev.sessionErrors,
        [sessionId]: errorMessage,
      },
    };
  });
}

/**
 * Clear the prompt, run an API call, and restore the prompt on error.
 * Re-throws the error after restoring so callers can still bail out.
 */
async function withPromptClearRestore(
  set: ChatStoreSet,
  sessionKey: string,
  workspaceKey: string,
  updateWorkspaceKey: boolean,
  previousPrompt: string,
  previousParts: PromptPart[],
  sessionId: string,
  apiCall: () => Promise<unknown>
) {
  clearPrompt(set, sessionKey, workspaceKey, updateWorkspaceKey);
  try {
    await apiCall();
  } catch (error) {
    const sdkError = mapSdkError(error);
    restorePrompt(
      set, sessionKey, workspaceKey, updateWorkspaceKey,
      previousPrompt, previousParts, sessionId, sdkError.message
    );
    throw error;
  }
}

export async function handleSendPrompt(
  input: PromptInputPayload,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
  const state = get();
  const directory = state.directory;
  if (!directory) return;

  const activeId = state.activeSessionId;
  if (activeId) {
    const sessionStatus = state.sessionStatus[activeId];
    const isBusy = sessionStatus?.type === 'busy' || sessionStatus?.type === 'retry';
    if (isBusy) {
      set({ pendingInterrupt: { sessionID: activeId, payload: input } });
      await handleAbortSession(get, set, activeId);
      return; // Event handler will send when session goes idle
    }
  }

  const mode = input.mode ?? 'prompt';
  const rawText = input.text;
  const trimmed = rawText.trim();
  const attachments = input.attachments ?? [];
  const inlineParts = input.parts ?? [];
  const hasFileParts = inlineParts.some((p) => p.type === 'file');
  if (!trimmed && attachments.length === 0 && !hasFileParts) return;

  // Validate agent and model before creating a session to prevent orphaned empty sessions.
  const resolvedAgent = resolveAgentName(state.agents, state.selectedAgent);
  if (!resolvedAgent) {
    throw new Error('No agent available. Configure an agent in OpenCode to send messages.');
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
    throw new Error('No model available. Configure a provider/model in OpenCode to send messages.');
  }

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

  const storedVariant = state.selectedVariantByDirectory[directory] ?? state.selectedVariant;
  const resolvedVariant = resolveModelVariant(state.providers, resolvedModel, storedVariant);

  const sessionKey = getPromptKey(directory, nextSessionId);
  const workspaceKey = getPromptKey(directory, null);
  const updateWorkspaceKey = state.activeSessionId === null && workspaceKey !== sessionKey;
  const previousPrompt = state.promptText;
  const previousParts = state.promptParts;

  if (mode === 'shell') {
    const command = trimmed.startsWith('!') ? trimmed.slice(1).trim() : trimmed;
    if (!command) return;
    await withPromptClearRestore(
      set, sessionKey, workspaceKey, updateWorkspaceKey,
      previousPrompt, previousParts, nextSessionId,
      () => client.session.shell({
        sessionID: nextSessionId,
        directory,
        command,
        agent: resolvedAgent,
        model: resolvedModel ?? undefined,
        ...(resolvedVariant ? { variant: resolvedVariant } : {}),
      })
    );
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
      await withPromptClearRestore(
        set, sessionKey, workspaceKey, updateWorkspaceKey,
        previousPrompt, previousParts, nextSessionId,
        () => client.session.command({
          sessionID: nextSessionId,
          directory,
          command: commandName,
          arguments: args.join(' '),
          agent: resolvedAgent,
          model: resolvedModel ? `${resolvedModel.providerID}/${resolvedModel.modelID}` : undefined,
          parts: commandParts.length > 0 ? commandParts : undefined,
          ...(resolvedVariant ? { variant: resolvedVariant } : {}),
        })
      );
      return;
    }
  }

  clearPrompt(set, sessionKey, workspaceKey, updateWorkspaceKey);

  const messageId = createMessageId();
  const textPartId = createPartId();
  const textPart: TextPartInput = {
    id: textPartId,
    type: 'text',
    text: rawText,
  };

  const inlineFiles = inlineParts.filter((p): p is PromptPart & { type: 'file'; path: string } => p.type === 'file');
  const inlineAgents = inlineParts.filter((p): p is PromptPart & { type: 'agent'; name: string } => p.type === 'agent');

  type FilePartWithSelection = PromptPart & { type: 'file'; path: string; selection?: { startLine: number; endLine: number } };

  const fileAttachmentParts = inlineFiles.map((ref) => {
    const fileRef = ref as FilePartWithSelection;
    const name = fileRef.path.split(/[/\\]/).pop() || fileRef.path;
    const absolute = resolveAbsolutePath(directory, fileRef.path);
    const selection = fileRef.selection
      ? { startLine: fileRef.selection.startLine, startChar: 0, endLine: fileRef.selection.endLine, endChar: 0 }
      : undefined;
    return {
      id: createPartId(),
      type: 'file' as const,
      mime: 'text/plain',
      url: buildFileUrl(directory, fileRef.path, selection),
      filename: name,
      source: {
        type: 'file' as const,
        path: absolute,
        text: {
          value: fileRef.content,
          start: fileRef.start,
          end: fileRef.end,
        },
      },
    };
  });

  const framingParts: TextPartInput[] = [];
  for (const ref of inlineFiles) {
    const fileRef = ref as FilePartWithSelection;
    if (!fileRef.selection) continue;
    const start = Math.min(fileRef.selection.startLine, fileRef.selection.endLine);
    const end = Math.max(fileRef.selection.startLine, fileRef.selection.endLine);
    const range = start === end ? `line ${start}` : `lines ${start} through ${end}`;
    framingParts.push({
      id: createPartId(),
      type: 'text',
      text: `The user referenced ${range} of ${fileRef.path}. Focus any changes on this section.`,
      synthetic: true,
    });
  }

  const usedUrls = new Set(fileAttachmentParts.map((part) => part.url));
  const currentFileParts: FilePartInput[] = [];
  const currentFileFramingParts: TextPartInput[] = [];
  const { currentFileContext, includeCurrentFile, lastSentFilePath } = get();
  if (currentFileContext && includeCurrentFile && currentFileContext.enabled) {
    const alreadySent = lastSentFilePath[nextSessionId] === currentFileContext.path;
    if (!alreadySent) {
      const url = buildFileUrl(directory, currentFileContext.path);
      if (!usedUrls.has(url)) {
        const name = currentFileContext.path.split(/[/\\]/).pop() || currentFileContext.path;
        currentFileParts.push({
          id: createPartId(),
          type: 'file',
          mime: 'text/plain',
          filename: name,
          url,
        });
        currentFileFramingParts.push({
          id: createPartId(),
          type: 'text',
          text: `User is now viewing ${currentFileContext.path}.`,
          synthetic: true,
        });
      }
      set((prev) => ({
        lastSentFilePath: { ...prev.lastSentFilePath, [nextSessionId]: currentFileContext.path },
      }));
    }
  }

  const agentAttachmentParts = inlineAgents.map((ref) => ({
    id: createPartId(),
    type: 'agent' as const,
    name: ref.name,
    source: {
      value: ref.content,
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
    ...framingParts,
    ...currentFileParts,
    ...currentFileFramingParts,
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

  void (async () => {
    try {
      await client.session.prompt({
        sessionID: nextSessionId,
        directory,
        messageID: messageId,
        parts: requestParts,
        agent: resolvedAgent,
        model: resolvedModel ?? undefined,
        ...(resolvedVariant ? { variant: resolvedVariant } : {}),
      });
    } catch (error) {
      const sdkError = mapSdkError(error);
      set((prev) => {
        const list = prev.messages[nextSessionId] ?? [];
        const nextParts = { ...prev.parts };
        delete nextParts[messageId];
        return {
          messages: {
            ...prev.messages,
            [nextSessionId]: removeMessage(list, messageId),
          },
          parts: nextParts,
          ...(sdkError.isAuthError && sdkError.providerID
            ? {
                providerAuthErrors: {
                  ...prev.providerAuthErrors,
                  [sdkError.providerID]: sdkError.message,
                },
              }
            : {}),
        };
      });
      restorePrompt(
        set, sessionKey, workspaceKey, updateWorkspaceKey,
        previousPrompt, previousParts, nextSessionId, sdkError.message
      );
    }
  })();
}
