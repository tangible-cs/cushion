import type { Event } from '@opencode-ai/sdk/v2/client';
import { getSessionErrorMessage, getProviderAuthError } from '@/lib/chat-helpers';
import {
  type OpenCodeDirectory,
  type ChatStoreGet,
  type ChatStoreSet,
  upsertSession,
  removeSession,
  upsertMessage,
  insertSortedById,
  removeById,
  getPromptKey,
  getStoredPromptText,
  getStoredContextItems,
  prunePromptSessions,
} from './chat-store-utils';

export function handleApplyEvent(
  event: Event,
  directory: OpenCodeDirectory,
  get: ChatStoreGet,
  set: ChatStoreSet
) {
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
}
