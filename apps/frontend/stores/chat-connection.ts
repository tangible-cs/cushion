import {
  getOpenCodeStatus,
  getSharedOpenCodeClient,
  disconnectSharedOpenCode,
  onOpenCodeEvent,
  onOpenCodeStatus,
} from '@/lib/shared-opencode-client';
import {
  resolveModel,
  resolveModelVariant,
  resolveAgentName,
} from '@/lib/chat-helpers';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import {
  type OpenCodeDirectory,
  type ChatStoreGet,
  type ChatStoreSet,
  initialState,
  getPromptKey,
  getStoredPromptText,
  getStoredContextItems,
  touchPromptSessions,
  prunePromptSessions,
  getDirectoryClient,
  unwrap,
} from './chat-store-utils';

let unsubscribeEvents: (() => void) | null = null;
let unsubscribeStatus: (() => void) | null = null;
let activeDirectory: OpenCodeDirectory | null = null;
let connectRequestId = 0;

function beginConnectRequest() {
  connectRequestId += 1;
  return connectRequestId;
}

function invalidateConnectRequests() {
  connectRequestId += 1;
}

function isConnectRequestCurrent(requestId: number) {
  return requestId === connectRequestId;
}

function cleanupSubscriptions() {
  if (unsubscribeEvents) unsubscribeEvents();
  if (unsubscribeStatus) unsubscribeStatus();
  unsubscribeEvents = null;
  unsubscribeStatus = null;
  activeDirectory = null;
}

export async function handleConnect(
  directory: OpenCodeDirectory,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
  const baseUrl = get().baseUrl;
  if (activeDirectory === directory && get().client && getOpenCodeStatus().baseUrl === baseUrl) return;

  const requestId = beginConnectRequest();
  const isCurrent = () => isConnectRequestCurrent(requestId);

  cleanupSubscriptions();
  activeDirectory = directory;

  const client = await getSharedOpenCodeClient({ baseUrl });
  if (!isCurrent()) return;
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
  if (!isCurrent()) return;
  const sessionData = sessionResult ? unwrap(sessionResult) : undefined;
  const agentResult = await localClient.app.agents({ directory }).catch(() => undefined);
  if (!isCurrent()) return;
  const agentData = agentResult ? unwrap(agentResult) : undefined;
  const agents = agentData ?? state.agents;
  const selectedAgentResolved = resolveAgentName(agents, selectedAgent);
  const commandResult = await localClient.command.list({ directory }).catch(() => undefined);
  if (!isCurrent()) return;
  const commandData = commandResult ? unwrap(commandResult) : undefined;
  const commands = commandData ?? state.commands;
  const coordinatorForConnect = await getSharedCoordinatorClient();
  await coordinatorForConnect.syncProviders().catch(() => undefined);
  if (!isCurrent()) return;
  const providerResult = await localClient.config.providers({ directory }).catch(() => undefined);
  if (!isCurrent()) return;
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
  const sessions = sessionData ?? [];
  const ids = new Set(sessions.map((item) => item.id));
  const nextActive = (!activeSessionId || !ids.has(activeSessionId))
    ? sessions[0]?.id ?? null
    : activeSessionId;

  if (!isCurrent()) return;
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
      sessions,
      activeSessionId: nextActive,
      activeSessionByDirectory: {
        ...prev.activeSessionByDirectory,
        [directory]: nextActive,
      },
      contextItems: getStoredContextItems(storedState, directory, nextActive),
      promptText: getStoredPromptText(storedState, directory, nextActive),
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
  if (!isCurrent()) return;

  if (nextActive) {
    await get().loadSessionMessages(nextActive);
    if (!isCurrent()) return;
  }

  unsubscribeStatus = onOpenCodeStatus((state) => {
    set({ connection: state, baseUrl: state.baseUrl });
  });

  unsubscribeEvents = onOpenCodeEvent(directory, (event, eventDirectory) => {
    if (event.type === 'permission.asked' && get().autoAccept) {
      const perm = event.properties;
      if (perm?.sessionID && perm?.id) {
        get().respondToPermission({
          sessionID: perm.sessionID,
          permissionID: perm.id,
          response: 'once',
        }).catch(() => undefined);
      }
    }
    get().applyEvent(event, eventDirectory);
  });
}

export function handleDisconnect(get: ChatStoreGet, set: ChatStoreSet) {
  invalidateConnectRequests();
  cleanupSubscriptions();
  disconnectSharedOpenCode();
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
}
