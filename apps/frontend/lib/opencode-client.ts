import {
  createOpencodeClient as createSdkClient,
  type Event,
  type OpencodeClient,
  type OpencodeClientConfig,
} from '@opencode-ai/sdk/v2/client';

export type OpenCodeEvent = Event;
export type OpenCodeClient = OpencodeClient;
export type OpenCodeClientConfig = OpencodeClientConfig;

export type OpenCodeClientOptions = OpenCodeClientConfig & {
  directory?: string;
};

const DEFAULT_OPENCODE_URL = 'http://localhost:14097';

export function getOpenCodeBaseUrl() {
  return import.meta.env.VITE_OPENCODE_URL ?? DEFAULT_OPENCODE_URL;
}

export function createOpenCodeClient(options: OpenCodeClientOptions = {}) {
  const baseUrl = options.baseUrl ?? getOpenCodeBaseUrl();
  return createSdkClient({
    ...options,
    baseUrl,
    throwOnError: options.throwOnError ?? true,
  });
}
