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

import {
  type OpenCodeDirectory,
  type ChatStoreGet,
  type ChatStoreSet,
  initialState,
  getPromptKey,
  getStoredPromptText,
  touchPromptSessions,
  prunePromptSessions,
  getDirectoryClient,
  unwrap,
} from './chat-store-utils';
import { useDiffReviewStore } from './diffReviewStore';
import { useWorkspaceStore } from './workspaceStore';

// Convert a path from OpenCode's namespace to a workspace-relative path.
function toWorkspacePath(openCodePath: string): string {
  const wsState = useWorkspaceStore.getState();
  const projectPath = wsState.metadata?.projectPath;
  if (!projectPath) return openCodePath;

  const normPath = openCodePath.replace(/\\/g, '/');
  const normProject = projectPath.replace(/\\/g, '/');

  // Absolute path — just make it relative to projectPath
  const isAbsolute = /^[A-Za-z]:[\\/]/.test(normPath) || normPath.startsWith('/');
  if (isAbsolute) {
    if (normPath.startsWith(normProject + '/')) {
      const result = normPath.slice(normProject.length + 1);
      return result;
    }
    return openCodePath;
  }

  // Relative path — strip workspace subfolder prefix (git root → projectPath offset)
  const gitRoot = wsState.metadata?.gitRoot;
  if (gitRoot) {
    const normGitRoot = gitRoot.replace(/\\/g, '/');
    if (normProject === normGitRoot) {
      return openCodePath;
    }

    const subFolder = normProject.startsWith(normGitRoot + '/')
      ? normProject.slice(normGitRoot.length + 1)
      : null;
    if (subFolder && normPath.startsWith(subFolder + '/')) {
      const result = normPath.slice(subFolder.length + 1);
      return result;
    }
  }

  // Already relative to projectPath (or no git root) — return as-is
  return openCodePath;
}

function captureEditSnapshot(perm: Record<string, unknown>) {
  const metadata = perm.metadata as Record<string, unknown> | undefined;
  if (!metadata) return;

  const sessionID = perm.sessionID as string;
  const { captureSnapshot } = useDiffReviewStore.getState();

  // apply_patch: prefer filePath (absolute) over relativePath for unambiguous resolution.
  const files = metadata.files as Array<{
    relativePath?: string;
    filePath?: string;
    before?: string;
    after?: string;
  }> | undefined;

  if (files && Array.isArray(files)) {
    for (const file of files) {
      const fp = file.filePath ?? file.relativePath;
      if (fp && file.before !== undefined && file.after !== undefined) {
        const wsPath = toWorkspacePath(fp);
        if (/\.(md|markdown)$/i.test(wsPath)) {
          captureSnapshot(wsPath, file.before, file.after, sessionID);
        }
      }
    }
    return;
  }

  // edit tool: metadata.filepath + metadata.diff — no explicit after available
  // Fall back to reading current editor content as before; after will come from disk later
  const filepath = metadata.filepath as string | undefined;
  if (filepath) {
    const patterns = (perm.patterns as string[] | undefined) ?? [];
    const rawPath = patterns[0] ?? filepath;
    const wsPath = toWorkspacePath(rawPath);

    if (/\.(md|markdown)$/i.test(wsPath)) {
      const content = useWorkspaceStore.getState().openFiles.get(wsPath)?.content;
      if (content !== undefined) {
        captureSnapshot(wsPath, content, content, sessionID);
      }
    }
  }
}

let unsubscribeEvents: (() => void) | null = null;
let unsubscribeStatus: (() => void) | null = null;
let activeDirectory: OpenCodeDirectory | null = null;
let connectRequestId = 0;

function beginConnectRequest() {
  connectRequestId += 1;
  return connectRequestId;
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
  const promptText = getStoredPromptText(state, directory, activeSessionId);
  const selectedAgent = state.selectedAgentByDirectory[directory] ?? null;
  const storedModel = state.selectedModelByDirectory[directory] ?? null;
  const storedVariant = state.selectedVariantByDirectory[directory] ?? null;

  set({
    baseUrl,
    directory,
    client,
    connection: getOpenCodeStatus(),
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
  // Sync disabled skills to OpenCode config on connect.
  // Fetch all skills so we can explicitly "allow" non-disabled ones,
  // clearing any stale "deny" entries left in opencode.json.
  const disabledSkills = get().disabledSkills;
  const skillsResult = await localClient.app.skills({ directory }).catch(() => undefined);
  if (!isCurrent()) return;
  const allSkillNames: string[] = Array.isArray(skillsResult?.data)
    ? skillsResult.data.map((s: { name: string }) => s.name)
    : [];
  const skillPerm: Record<string, 'allow' | 'deny'> = { '*': 'allow' };
  for (const name of allSkillNames) {
    skillPerm[name] = disabledSkills.includes(name) ? 'deny' : 'allow';
  }
  await localClient.global.config.update({
    config: { permission: { skill: skillPerm } },
  }).catch((err: unknown) => console.error('[skills] connect sync failed', err));
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
      prev.promptBySession
    );
    const storedState = {
      ...prev,
      promptBySession: pruned.promptBySession,
    };
    return {
      sessions,
      activeSessionId: nextActive,
      activeSessionByDirectory: {
        ...prev.activeSessionByDirectory,
        [directory]: nextActive,
      },
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
      allSkillNames,
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
    if (event.type === 'permission.asked') {
      const perm = event.properties;
      if (perm?.sessionID && perm?.id) {
        const reviewMode = get().reviewMode;
        const isEdit = perm.permission === 'edit';

        // Always auto-accept (edits are never blocked now)
        get().respondToPermission({
          sessionID: perm.sessionID,
          permissionID: perm.id,
          response: 'once',
        }).catch(() => undefined);

        // Capture snapshot when review mode is ON
        if (isEdit && reviewMode) {
          captureEditSnapshot(perm);
        }
      }
    }
    get().applyEvent(event, eventDirectory);
  });
}

export function handleDisconnect(get: ChatStoreGet, set: ChatStoreSet) {
  beginConnectRequest();
  cleanupSubscriptions();
  disconnectSharedOpenCode();
  set((state) => ({
    ...initialState,
    connection: getOpenCodeStatus(),
    promptBySession: state.promptBySession,
    promptSessionOrder: state.promptSessionOrder,
    activeSessionByDirectory: state.activeSessionByDirectory,
    selectedAgentByDirectory: state.selectedAgentByDirectory,
    selectedModelByDirectory: state.selectedModelByDirectory,
    selectedVariantByDirectory: state.selectedVariantByDirectory,
    modelVisibility: state.modelVisibility,
    disabledSkills: state.disabledSkills,
  }));
}
