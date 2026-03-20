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

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type MessageTurn = {
  userMessage: Message;
  assistantMessages: AssistantMessage[];
};

export const EMPTY_MESSAGES: Message[] = [];
export const EMPTY_PARTS: Part[] = [];
export const TEXT_RENDER_THROTTLE_MS = 100;

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

function cleanHeading(value: string) {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .trim();
}

export function extractReasoningHeading(text: string): string | undefined {
  const markdown = text.replace(/\r\n?/g, '\n');

  const html = markdown.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  if (html?.[1]) {
    const value = cleanHeading(html[1].replace(/<[^>]+>/g, ' '));
    if (value) return value;
  }

  const atx = markdown.match(/^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/m);
  if (atx?.[1]) {
    const value = cleanHeading(atx[1]);
    if (value) return value;
  }

  const setext = markdown.match(/^([^\n]+)\n(?:=+|-+)\s*$/m);
  if (setext?.[1]) {
    const value = cleanHeading(setext[1]);
    if (value) return value;
  }

  const strong = markdown.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*$/m);
  if (strong?.[1]) {
    const value = cleanHeading(strong[1]);
    if (value) return value;
  }
}

export function formatDuration(startMs: number, endMs: number) {
  const delta = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(delta / 60);
  const seconds = delta % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function resolveModelName(
  providers: { id: string; models: Record<string, { name?: string }> }[],
  providerID: string,
  modelID: string,
): string {
  const provider = providers.find((p) => p.id === providerID);
  return provider?.models?.[modelID]?.name ?? modelID;
}

export function isInterrupted(message: AssistantMessage): boolean {
  return message.error?.name === 'MessageAbortedError';
}

export function unwrapError(message: string): string {
  const text = message.replace(/^Error:\s*/, '').trim();

  const parse = (value: string): unknown => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  };

  const read = (value: string): unknown => {
    const first = parse(value);
    if (typeof first !== 'string') return first;
    return parse(first.trim());
  };

  let json = read(text);

  if (json === undefined) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      json = read(text.slice(start, end + 1));
    }
  }

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

  if (!isRecord(json)) return message;

  const err = isRecord(json.error) ? json.error : undefined;
  if (err) {
    const type = typeof err.type === 'string' ? err.type : undefined;
    const msg = typeof err.message === 'string' ? err.message : undefined;
    if (type && msg) return `${type}: ${msg}`;
    if (msg) return msg;
    if (type) return type;
    const code = typeof err.code === 'string' ? err.code : undefined;
    if (code) return code;
  }

  const msg = typeof json.message === 'string' ? json.message : undefined;
  if (msg) return msg;

  const reason = typeof json.error === 'string' ? json.error : undefined;
  if (reason) return reason;

  return message;
}

export function buildFooterMeta(
  message: AssistantMessage,
  providers: { id: string; models: Record<string, { name?: string }> }[],
  durationStr: string,
): string {
  const agent = message.agent;
  const items = [
    agent ? agent[0].toUpperCase() + agent.slice(1) : '',
    resolveModelName(providers, message.providerID, message.modelID),
    durationStr,
    isInterrupted(message) ? 'Interrupted' : '',
  ];
  return items.filter(Boolean).join(' \u00B7 ');
}
