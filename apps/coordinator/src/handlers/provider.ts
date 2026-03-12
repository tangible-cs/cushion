import type { Provider, AuthMethod } from '@cushion/types';
import { CredentialStorage } from '../providers/storage.js';
import { getAllProviders, getProviderByID, getPopularProviderIDs } from '../providers/registry.js';
import { getModelsDevCache } from '../providers/models-dev.js';
import { getOAuthHandler } from '../providers/oauth.js';
import { syncCredentialsToOpenCode } from '../providers/credential-sync.js';

export async function handleProviderList(
  credentialStorage: CredentialStorage
): Promise<{ providers: Provider[]; connected: string[] }> {
  const providers = await getAllProviders();
  const connected = await credentialStorage.getConnectedProviderIDs();
  return { providers, connected };
}

export async function handleProviderSync(
  credentialStorage: CredentialStorage
): Promise<{ success: boolean }> {
  await syncCredentialsToOpenCode(credentialStorage);
  return { success: true };
}

export async function handleProviderRefresh(
  credentialStorage: CredentialStorage
): Promise<{ providers: Provider[]; connected: string[] }> {
  const cache = getModelsDevCache();
  await cache.refresh();

  const providers = await getAllProviders();
  const connected = await credentialStorage.getConnectedProviderIDs();
  return { providers, connected };
}

export function handleProviderPopular(): { ids: string[] } {
  return { ids: getPopularProviderIDs() };
}

export async function handleProviderAuthMethods(): Promise<
  Record<string, AuthMethod[]>
> {
  const providers = await getAllProviders();
  const authMethods: Record<string, AuthMethod[]> = {};

  for (const provider of providers) {
    authMethods[provider.id] = provider.authMethods ?? [{ type: 'api', label: 'API Key' }];
  }

  return authMethods;
}

export async function handleProviderAuthSet(
  credentialStorage: CredentialStorage,
  params: { providerID: string; apiKey: string }
): Promise<{ success: boolean }> {
  const { providerID, apiKey } = params;

  const provider = await getProviderByID(providerID);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerID}`);
  }

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('API key cannot be empty');
  }

  await validateApiKey(providerID, apiKey);
  await credentialStorage.setCredential(providerID, apiKey);

  return { success: true };
}

export async function handleProviderAuthRemove(
  credentialStorage: CredentialStorage,
  params: { providerID: string }
): Promise<{ success: boolean }> {
  await credentialStorage.removeCredential(params.providerID);
  return { success: true };
}

export async function handleProviderOAuthAuthorize(params: {
  providerID: string;
  method: number;
  inputs?: Record<string, string>;
}): Promise<{ url: string; method: 'auto' | 'code'; instructions: string }> {
  const { providerID, method, inputs = {} } = params;

  const provider = await getProviderByID(providerID);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerID}`);
  }

  const authMethod = provider.authMethods?.[method];
  if (!authMethod) {
    throw new Error(`Invalid auth method index: ${method}`);
  }

  if (authMethod.type !== 'oauth') {
    throw new Error(`Auth method is not OAuth: ${authMethod.type}`);
  }

  const oauth = getOAuthHandler();
  return oauth.authorize(providerID, method, inputs);
}

export async function handleProviderOAuthCallback(
  credentialStorage: CredentialStorage,
  params: { providerID: string; method: number; code?: string }
): Promise<{ success: boolean }> {
  const { providerID, method, code } = params;

  const provider = await getProviderByID(providerID);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerID}`);
  }

  const authMethod = provider.authMethods?.[method];
  if (!authMethod) {
    throw new Error(`Invalid auth method index: ${method}`);
  }

  const oauth = getOAuthHandler();
  const result = await oauth.callback(providerID, method, code);

  if (!result.success) {
    throw new Error('OAuth callback failed');
  }

  if (result.type === 'api' && result.key) {
    await credentialStorage.setCredential(providerID, result.key);
  } else if (result.type === 'oauth') {
    await credentialStorage.setOAuthCredential(providerID, {
      access: result.access!,
      refresh: result.refresh,
      expires: result.expires,
      accountId: result.accountId,
    });
  }

  return { success: true };
}

async function validateApiKey(providerID: string, apiKey: string): Promise<void> {
  switch (providerID) {
    case 'anthropic':
      await validateAnthropicKey(apiKey);
      break;
    case 'openai':
      await validateOpenAIKey(apiKey);
      break;
    case 'google':
      await validateGoogleKey(apiKey);
      break;
    case 'meta':
      break;
    case 'openrouter':
      await validateOpenRouterKey(apiKey);
      break;
    default:
      console.warn(`[Coordinator] No validation for provider: ${providerID}`);
  }
}

async function validateAnthropicKey(apiKey: string): Promise<void> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    throw new Error(`API key validation failed: ${response.status} ${error}`);
  }
}

async function validateOpenAIKey(apiKey: string): Promise<void> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    throw new Error(`API key validation failed: ${response.status} ${error}`);
  }
}

async function validateGoogleKey(apiKey: string): Promise<void> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 403) {
      throw new Error('Invalid API key');
    }
    throw new Error(`API key validation failed: ${response.status} ${error}`);
  }
}

async function validateOpenRouterKey(apiKey: string): Promise<void> {
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid API key');
    }
    throw new Error(`API key validation failed: ${response.status} ${error}`);
  }
}

