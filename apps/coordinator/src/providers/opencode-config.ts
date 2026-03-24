import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export function getOpenCodeConfigDir(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfig, 'opencode');
}

// Sets default permissions in opencode.json if not already configured
export async function ensurePermissionDefaults(): Promise<void> {
  const configPath = path.join(getOpenCodeConfigDir(), 'opencode.json');
  let config: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    config = JSON.parse(content);
  } catch {}

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
