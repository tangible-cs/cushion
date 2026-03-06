import type { ConfigManager } from '../workspace/config-manager.js';

export async function handleConfigRead(
  configManager: ConfigManager,
  params: { file: string }
): Promise<{ content: string | null; exists: boolean }> {
  return configManager.readConfig(params.file);
}

export async function handleConfigWrite(
  configManager: ConfigManager,
  params: { file: string; content: string }
): Promise<{ success: boolean }> {
  await configManager.writeConfig(params.file, params.content);
  return { success: true };
}

export async function handleListSnippets(
  configManager: ConfigManager
): Promise<{ snippets: string[] }> {
  const snippets = await configManager.listSnippets();
  return { snippets };
}

export async function handleReadSnippet(
  configManager: ConfigManager,
  params: { name: string }
): Promise<{ content: string }> {
  const content = await configManager.readSnippet(params.name);
  return { content };
}

export async function handleWriteSnippet(
  configManager: ConfigManager,
  params: { name: string; content: string }
): Promise<{ success: boolean }> {
  await configManager.writeSnippet(params.name, params.content);
  return { success: true };
}

export async function handleDeleteSnippet(
  configManager: ConfigManager,
  params: { name: string }
): Promise<{ success: boolean }> {
  await configManager.deleteSnippet(params.name);
  return { success: true };
}
