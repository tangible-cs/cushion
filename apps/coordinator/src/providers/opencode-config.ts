/**
 * OpenCode Config Helpers
 *
 * Shared utilities for reading and locating the OpenCode configuration file
 * at ~/.config/opencode/opencode.json. Used by credential-sync to bridge
 * Cushion-managed credentials into OpenCode's provider config.
 */

import path from 'path';
import os from 'os';

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
