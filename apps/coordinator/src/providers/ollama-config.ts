import path from 'path';
import os from 'os';

export interface OllamaProviderConfig {
  npm: string;
  name: string;
  options: {
    baseURL: string;
  };
  models: Record<string, OllamaModelConfig>;
}

export interface OllamaModelConfig {
  id: string;
  name: string;
  limit?: {
    context: number;
    output: number;
  };
  options?: {
    tools: boolean;
  };
}

export async function writeOllamaToConfig(
  baseUrl: string,
  models: Array<{ id: string; name: string; family: string }>,
  contextWindows: Record<string, number>,
): Promise<void> {
  const configPath = getOpenCodeConfigPath();
  const modelConfigs: Record<string, OllamaModelConfig> = {};

  for (const model of models) {
    const contextWindow = contextWindows[model.id] || 8192;
    const outputTokens = Math.floor(contextWindow * 0.85);

    modelConfigs[model.id] = {
      id: model.id,
      name: model.name,
      limit: {
        context: contextWindow,
        output: outputTokens,
      },
      options: {
        tools: true,
      },
    };
  }

  const providerConfig: OllamaProviderConfig = {
    npm: '@ai-sdk/openai-compatible',
    name: 'Ollama (local)',
    options: {
      baseURL: `${baseUrl}/v1`,
    },
    models: modelConfigs,
  };

  let existingConfig: Record<string, unknown> = {};
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(configPath, 'utf-8').catch(() => '{}');
    existingConfig = JSON.parse(content);
  } catch {
    existingConfig = {};
  }

  const mergedConfig = {
    ...(existingConfig as Record<string, unknown>),
    $schema: (existingConfig.$schema as string) || 'https://opencode.ai/config.json',
    provider: {
      ...(existingConfig.provider as Record<string, unknown>),
      ollama: providerConfig,
    },
  };

  const fs = await import('fs/promises');
  const configDir = path.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

}

export function getOpenCodeConfigPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, 'opencode', 'opencode.json');
}

export async function readOpenCodeConfig(): Promise<Record<string, unknown>> {
  const configPath = getOpenCodeConfigPath();
  try {
    const fs = await import('fs/promises');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}
