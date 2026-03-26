import type { ConfigManager } from '../config-manager';

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
