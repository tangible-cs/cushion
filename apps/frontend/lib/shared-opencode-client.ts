import { createOpenCodeClient, getOpenCodeBaseUrl, type OpenCodeClient, type OpenCodeEvent } from './opencode-client';

export type OpenCodeConnectionState = {
  status: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  baseUrl: string;
  error?: string;
};

type OpenCodeEventListener = (event: OpenCodeEvent, directory: string) => void;
type OpenCodeStatusListener = (state: OpenCodeConnectionState) => void;

let sharedClient: OpenCodeClient | null = null;
let sharedBaseUrl: string | null = null;
let connectionPromise: Promise<OpenCodeClient> | null = null;
let abortController: AbortController | null = null;

let connectionState: OpenCodeConnectionState = {
  status: 'idle',
  baseUrl: getOpenCodeBaseUrl(),
};

const listenersByDirectory = new Map<string, Set<OpenCodeEventListener>>();
const listenersAll = new Set<OpenCodeEventListener>();
const statusListeners = new Set<OpenCodeStatusListener>();

const RETRY_MIN_MS = 3000;
const RETRY_MAX_MS = 30000;
const HEARTBEAT_TIMEOUT_MS = 15_000;
const RECONNECT_DELAY_MS = 250;

function setConnectionState(next: OpenCodeConnectionState) {
  connectionState = next;
  statusListeners.forEach((listener) => listener(connectionState));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function sleep(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

function emitEvent(directory: string, payload: OpenCodeEvent) {
  const byDirectory = listenersByDirectory.get(directory);
  if (byDirectory) {
    byDirectory.forEach((listener) => listener(payload, directory));
  }
  listenersAll.forEach((listener) => listener(payload, directory));
}

type EventProperties = {
  sessionID?: string;
  part?: { messageID?: string; id?: string };
};

function coalesceKey(directory: string, payload: OpenCodeEvent) {
  const properties = (payload as { properties?: EventProperties }).properties;
  if (payload.type === 'session.status' && properties?.sessionID) {
    return `session.status:${directory}:${properties.sessionID}`;
  }
  if (payload.type === 'lsp.updated') {
    return `lsp.updated:${directory}`;
  }
  if (payload.type === 'message.part.updated' && properties?.part?.messageID && properties.part.id) {
    return `message.part.updated:${directory}:${properties.part.messageID}:${properties.part.id}`;
  }
  return undefined;
}

type QueuedEvent = { directory: string; payload: OpenCodeEvent };

let queue: Array<QueuedEvent | undefined> = [];
let buffer: Array<QueuedEvent | undefined> = [];
let coalesced = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let lastFlush = 0;

function flushQueue() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;

  if (queue.length === 0) return;

  const events = queue;
  queue = buffer;
  buffer = events;
  queue.length = 0;
  coalesced.clear();
  lastFlush = Date.now();

  for (const item of events) {
    if (!item) continue;
    emitEvent(item.directory, item.payload);
  }

  buffer.length = 0;
}

function scheduleFlush() {
  if (flushTimer) return;
  const elapsed = Date.now() - lastFlush;
  flushTimer = setTimeout(flushQueue, Math.max(0, 16 - elapsed));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function runEventLoop(client: OpenCodeClient, baseUrl: string, signal: AbortSignal) {
  let retryMs = RETRY_MIN_MS;
  let attempt: AbortController | undefined;
  let lastEventAt = Date.now();
  let heartbeat: ReturnType<typeof setTimeout> | undefined;

  const resetHeartbeat = () => {
    lastEventAt = Date.now();
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = setTimeout(() => {
      attempt?.abort();
    }, HEARTBEAT_TIMEOUT_MS);
  };

  const clearHeartbeat = () => {
    if (heartbeat) clearTimeout(heartbeat);
    heartbeat = undefined;
  };

  const onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastEventAt < HEARTBEAT_TIMEOUT_MS) return;
    attempt?.abort();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  try {
    while (!signal.aborted) {
      setConnectionState({
        status: connectionState.status === 'connected' ? 'reconnecting' : 'connecting',
        baseUrl,
      });

      const healthOk = await client.global
        .health({ signal, throwOnError: true })
        .then(() => true)
        .catch((error) => {
          if (signal.aborted) return false;
          setConnectionState({ status: 'error', baseUrl, error: getErrorMessage(error) });
          return false;
        });

      if (!healthOk) {
        await sleep(retryMs, signal);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        continue;
      }

      setConnectionState({ status: 'connected', baseUrl });
      retryMs = RETRY_MIN_MS;

      attempt = new AbortController();
      const onMainAbort = () => attempt?.abort();
      signal.addEventListener('abort', onMainAbort);

      try {
        const events = await client.global.event({ signal: attempt.signal });
        resetHeartbeat();

        for await (const event of events.stream) {
          resetHeartbeat();
          const directory = event.directory ?? 'global';
          const payload = event.payload;
          if (!payload) continue;
          const key = coalesceKey(directory, payload);
          if (key) {
            const index = coalesced.get(key);
            if (index !== undefined) queue[index] = undefined;
            coalesced.set(key, queue.length);
          }
          queue.push({ directory, payload });
          scheduleFlush();
        }
      } catch (error) {
        if (signal.aborted) break;
        if (!isAbortError(error)) {
          setConnectionState({ status: 'error', baseUrl, error: getErrorMessage(error) });
        }
      } finally {
        signal.removeEventListener('abort', onMainAbort);
        attempt = undefined;
        clearHeartbeat();
      }

      flushQueue();

      if (!signal.aborted) {
        await sleep(RECONNECT_DELAY_MS, signal);
      }
    }
  } finally {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    flushQueue();
  }
}

export async function getSharedOpenCodeClient(options?: { baseUrl?: string }) {
  const baseUrl = options?.baseUrl ?? getOpenCodeBaseUrl();

  if (sharedClient && sharedBaseUrl === baseUrl) {
    return sharedClient;
  }

  if (connectionPromise && sharedBaseUrl === baseUrl) {
    return connectionPromise;
  }

  disconnectSharedOpenCode();

  abortController = new AbortController();
  sharedBaseUrl = baseUrl;
  sharedClient = createOpenCodeClient({ baseUrl, signal: abortController.signal, throwOnError: true });
  connectionPromise = Promise.resolve(sharedClient);

  void runEventLoop(sharedClient, baseUrl, abortController.signal);

  return connectionPromise;
}

export function onOpenCodeEvent(directory: string, listener: OpenCodeEventListener) {
  if (directory === '*') {
    listenersAll.add(listener);
    return () => listenersAll.delete(listener);
  }

  const set = listenersByDirectory.get(directory) ?? new Set<OpenCodeEventListener>();
  set.add(listener);
  listenersByDirectory.set(directory, set);

  return () => {
    set.delete(listener);
    if (set.size === 0) listenersByDirectory.delete(directory);
  };
}

export function onOpenCodeStatus(listener: OpenCodeStatusListener) {
  statusListeners.add(listener);
  listener(connectionState);
  return () => statusListeners.delete(listener);
}

export function getOpenCodeStatus() {
  return connectionState;
}

export function disconnectSharedOpenCode() {
  if (abortController) abortController.abort();
  abortController = null;
  sharedClient = null;
  sharedBaseUrl = null;
  connectionPromise = null;

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = undefined;
  queue.length = 0;
  buffer.length = 0;
  coalesced.clear();
  lastFlush = 0;

  setConnectionState({ status: 'idle', baseUrl: getOpenCodeBaseUrl() });
}
