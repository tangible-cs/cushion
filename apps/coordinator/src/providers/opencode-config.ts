/**
 * OpenCode Config Helpers
 *
 * Provides the OpenCode config directory path (used by skill install)
 * and a one-time permission defaults initialiser that runs at coordinator startup.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export function getOpenCodeConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, 'opencode');
}

/**
 * Set sensible permission defaults on startup so read-only tools run without
 * prompts while destructive actions still go through Cushion's auto-accept toggle.
 *
 * Writes directly to opencode.json (the coordinator has no SDK client).
 * Only writes if `permission` is not already set, so it won't overwrite user config.
 */
export async function ensurePermissionDefaults(): Promise<void> {
  const configPath = path.join(getOpenCodeConfigDir(), 'opencode.json');
  let config: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  if (config.permission) return;

  config.permission = {
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    todoread: 'allow',
    lsp: 'allow',
    edit: 'ask',
    bash: 'ask',
    task: 'ask',
    webfetch: 'ask',
    websearch: 'ask',
    codesearch: 'ask',
  };

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
