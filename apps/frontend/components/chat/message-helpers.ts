import type {
  Message,
  Part,
  TextPart,
  FilePart,
  AgentPart,
  ToolPart,
  ReasoningPart,
  SnapshotPart,
  PatchPart,
  StepStartPart,
  StepFinishPart,
  RetryPart,
  AssistantMessage,
} from '@opencode-ai/sdk/v2/client';

export type MessageTurn = {
  userMessage: Message;
  assistantMessages: AssistantMessage[];
};

export const EMPTY_MESSAGES: Message[] = [];
export const EMPTY_PARTS: Part[] = [];
export const TEXT_RENDER_THROTTLE_MS = 100;

export function same<T>(a: readonly T[], b: readonly T[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

export function isText(part: Part): part is TextPart {
  return part.type === 'text';
}

export function isReasoning(part: Part): part is ReasoningPart {
  return part.type === 'reasoning';
}

export function isFile(part: Part): part is FilePart {
  return part.type === 'file';
}

export function isAgent(part: Part): part is AgentPart {
  return part.type === 'agent';
}

export function isAttachment(part: FilePart) {
  const mime = part.mime ?? '';
  return mime.startsWith('image/') || mime === 'application/pdf';
}

export function isTool(part: Part): part is ToolPart {
  return part.type === 'tool';
}

export function isSnapshot(part: Part): part is SnapshotPart {
  return part.type === 'snapshot';
}

export function isPatch(part: Part): part is PatchPart {
  return part.type === 'patch';
}

export function isStepStart(part: Part): part is StepStartPart {
  return part.type === 'step-start';
}

export function isStepFinish(part: Part): part is StepFinishPart {
  return part.type === 'step-finish';
}

export function isRetry(part: Part): part is RetryPart {
  return part.type === 'retry';
}

export function getUserText(parts: Part[]) {
  return parts.find((part) => isText(part) && !part.synthetic) as TextPart | undefined;
}

export function getLastTextPart(parts: Part[]) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part && isText(part)) return part;
  }
  return undefined;
}

export function getFiles(parts: Part[]) {
  return parts.filter(isFile);
}

export function groupMessagesIntoTurns(messages: Message[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let currentTurn: MessageTurn | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      if (currentTurn) {
        turns.push(currentTurn);
      }
      currentTurn = { userMessage: message, assistantMessages: [] };
    } else if (message.role === 'assistant' && currentTurn) {
      currentTurn.assistantMessages.push(message as AssistantMessage);
    }
  }

  if (currentTurn) {
    turns.push(currentTurn);
  }

  return turns;
}

export function computeStatusFromPart(part: Part | undefined): string | undefined {
  if (!part) return undefined;

  if (part.type === 'tool') {
    switch (part.tool) {
      case 'task':
        return 'Delegating to agent...';
      case 'todowrite':
      case 'todoread':
        return 'Planning tasks...';
      case 'read':
        return 'Reading file...';
      case 'list':
      case 'grep':
      case 'glob':
        return 'Searching codebase...';
      case 'webfetch':
        return 'Searching web...';
      case 'edit':
      case 'write':
        return 'Making edits...';
      case 'bash':
        return 'Running commands...';
      default:
        return undefined;
    }
  }
  if (part.type === 'reasoning') {
    const text = part.text ?? '';
    const match = text.trimStart().match(/^\*\*(.+?)\*\*/);
    if (match) return `Thinking: ${match[1].trim()}`;
    return 'Thinking...';
  }
  if (part.type === 'text') {
    return 'Gathering thoughts...';
  }
  return undefined;
}

export function formatDuration(startMs: number, endMs: number) {
  const delta = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
