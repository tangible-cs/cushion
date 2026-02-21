import type { TextPartInput, FilePartInput, AgentPartInput, Part, Message } from '@opencode-ai/sdk/v2/client';
import {
  createMessageId,
  createPartId,
  resolveAgentName,
  resolveModel,
  resolveModelVariant,
  resolveInlineReferences,
  resolveAbsolutePath,
  buildFileUrl,
  getSessionErrorMessage,
  getProviderAuthError,
} from '@/lib/chat-helpers';
import {
  type PromptInputPayload,
  type PromptContextItem,
  type PromptSelection,
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

export async function handleSendPrompt(
  input: PromptInputPayload,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
  const state = get();
  const directory = state.directory;
  if (!directory) return;

  const mode = input.mode ?? 'prompt';
  const rawText = input.text;
  const trimmed = rawText.trim();
  const attachments = input.attachments ?? [];
  const contextItems = state.contextItems;
  if (!trimmed && attachments.length === 0 && contextItems.length === 0) return;

  // Validate agent and model BEFORE creating a session (matches OpenCode reference).
  // This prevents orphaned empty sessions when preconditions aren't met.
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

  if (!state.activeSessionId) {
    set((prev) => ({
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
      await client.session.shell({
        sessionID: nextSessionId,
        directory,
        command,
        agent: resolvedAgent,
        model: resolvedModel ?? undefined,
        ...(resolvedVariant ? { variant: resolvedVariant } : {}),
      });
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
        await client.session.command({
          sessionID: nextSessionId,
          directory,
          command: commandName,
          arguments: args.join(' '),
          agent: resolvedAgent,
          model: resolvedModel ? `${resolvedModel.providerID}/${resolvedModel.modelID}` : undefined,
          parts: commandParts.length > 0 ? commandParts : undefined,
          ...(resolvedVariant ? { variant: resolvedVariant } : {}),
        });
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
}
