/**
 * Provider Registry
 *
 * Fetches provider/model data from models.dev API (matching OpenCode)
 */

import { getModelsDevCache } from './models-dev';
import type { Provider, Model, AuthMethod } from '@cushion/types';

// Popular providers order (matching OpenCode)
const POPULAR_PROVIDERS = [
  'opencode',
  'anthropic',
  'openai',
  'google',
  'meta',
  'vercel',
  'openrouter',
  'github-copilot',
];

// Manual auth method overrides for providers with OAuth support
// models.dev doesn't include auth_methods, so we add them manually
const PROVIDER_AUTH_OVERRIDES: Record<string, AuthMethod[]> = {
  'openai': [
    {
      type: 'oauth',
      label: 'ChatGPT Pro/Plus (device code)',
    },
    {
      type: 'api',
      label: 'Manually enter API Key',
    },
  ],
  'github-copilot': [
    {
      type: 'oauth',
      label: 'Login with GitHub Copilot',
    },
    {
      type: 'api',
      label: 'Manually enter API Key',
    },
  ],
};

export async function getAllProviders(): Promise<Provider[]> {
  const cache = getModelsDevCache();
  const modelsDevData = await cache.getProviders();

  const providers: Provider[] = Object.entries(modelsDevData).map(([providerID, devProvider]) => {
    // Extract models from models.dev format
    const models: Record<string, Model> = {};

    for (const [modelID, devModel] of Object.entries(devProvider.models)) {
      models[modelID] = {
        id: modelID,
        providerID,
        name: devModel.name,
        capabilities: {
          text: devModel.modalities?.input?.includes('text') ?? true,
          images: devModel.modalities?.input?.includes('image') ?? false,
          audio: devModel.modalities?.input?.includes('audio') ?? false,
        },
        cost: devModel.cost
          ? {
              input: devModel.cost.input ?? 0,
              output: devModel.cost.output ?? 0,
            }
          : { input: 0, output: 0 },
        limit: devModel.limit
          ? {
              context: devModel.limit.context ?? 128000,
              maxTokens: devModel.limit.input ?? devModel.limit.output ?? 4096,
            }
          : { context: 128000, maxTokens: 4096 },
      };
    }

    // Use override if available, otherwise default to API Key
    let authMethods: AuthMethod[];
    if (PROVIDER_AUTH_OVERRIDES[providerID]) {
      authMethods = PROVIDER_AUTH_OVERRIDES[providerID];
    } else if (devProvider.auth_methods) {
      authMethods = devProvider.auth_methods.map((m: any) => ({
        type: m.type === 'oauth' ? 'oauth' : 'api',
        label: m.label,
      }));
    } else {
      authMethods = [{ type: 'api', label: 'API Key' }];
    }

    return {
      id: providerID,
      name: devProvider.name,
      source: 'api' as const,
      models,
      authMethods,
    };
  });

  return providers;
}

export async function getProviderByID(id: string): Promise<Provider | undefined> {
  const providers = await getAllProviders();
  return providers.find((p) => p.id === id);
}

export async function getProviderModels(providerID: string): Promise<Model[]> {
  const provider = await getProviderByID(providerID);
  if (!provider) return [];
  return Object.values(provider.models);
}

export async function getAllModels(): Promise<Model[]> {
  const providers = await getAllProviders();
  return providers.flatMap((provider) => Object.values(provider.models));
}

export function getPopularProviderIDs(): string[] {
  return POPULAR_PROVIDERS;
}
