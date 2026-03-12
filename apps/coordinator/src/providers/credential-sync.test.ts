import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { syncCredentialsToOpenCode } from './credential-sync.js';
import { CredentialStorage } from './storage.js';

let tmpDir: string;
let prev: string | undefined;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cushion-sync-'));
  prev = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'xdg');
});

afterEach(async () => {
  if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prev;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('syncCredentialsToOpenCode', () => {
  test('removes stale legacy provider config', async () => {
    const cfg = path.join(process.env.XDG_CONFIG_HOME!, 'opencode', 'opencode.json');
    await fs.mkdir(path.dirname(cfg), { recursive: true });
    await fs.writeFile(
      cfg,
      JSON.stringify({
        provider: {
          ollama: {
            name: 'Ollama (local)',
            options: { baseURL: 'http://localhost:11434/v1' },
            models: { llama3: { id: 'llama3', name: 'Llama 3' } },
          },
          anthropic: {
            options: { region: 'us' },
          },
        },
      })
    );

    const storage = new CredentialStorage(path.join(tmpDir, 'cushion'));
    await storage.setCredential('anthropic', 'sk-test');

    await syncCredentialsToOpenCode(storage);

    const saved = JSON.parse(await fs.readFile(cfg, 'utf-8'));
    expect(saved.provider.ollama).toBeUndefined();
    expect(saved.provider.anthropic.options.apiKey).toBe('sk-test');
    expect(saved.provider.anthropic.options.region).toBe('us');
  });
});
