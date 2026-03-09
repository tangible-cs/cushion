import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ConfigManager } from './config-manager';

let manager: ConfigManager;
let tmpDir: string;

beforeEach(async () => {
  manager = new ConfigManager();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cushion-config-test-'));
  manager.setWorkspacePath(tmpDir);
});

afterEach(async () => {
  manager.clearWorkspacePath();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readConfig / writeConfig
// ---------------------------------------------------------------------------

describe('readConfig', () => {
  test('returns null for missing file', async () => {
    const result = await manager.readConfig('settings.json');
    expect(result).toEqual({ content: null, exists: false });
  });

  test('reads existing file', async () => {
    const configDir = path.join(tmpDir, '.cushion');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'settings.json'), '{"a":1}');

    const result = await manager.readConfig('settings.json');
    expect(result).toEqual({ content: '{"a":1}', exists: true });
  });
});

describe('writeConfig', () => {
  test('creates .cushion dir and writes file', async () => {
    await manager.writeConfig('settings.json', '{"test":true}');

    const content = await fs.readFile(
      path.join(tmpDir, '.cushion', 'settings.json'),
      'utf-8'
    );
    expect(content).toBe('{"test":true}');
  });

  test('write then read roundtrip', async () => {
    const data = JSON.stringify({ hello: 'world' }, null, 2);
    await manager.writeConfig('appearance.json', data);

    const result = await manager.readConfig('appearance.json');
    expect(result.exists).toBe(true);
    expect(result.content).toBe(data);
  });
});

// ---------------------------------------------------------------------------
// Filename validation
// ---------------------------------------------------------------------------

describe('config filename validation', () => {
  test('rejects path with /', async () => {
    await expect(manager.readConfig('sub/file.json')).rejects.toThrow('path traversal');
  });

  test('rejects path with \\', async () => {
    await expect(manager.readConfig('sub\\file.json')).rejects.toThrow('path traversal');
  });

  test('rejects ..', async () => {
    await expect(manager.readConfig('../etc.json')).rejects.toThrow('path traversal');
  });

  test('rejects non-.json extension', async () => {
    await expect(manager.readConfig('settings.txt')).rejects.toThrow('must end with .json');
  });

  test('rejects empty name', async () => {
    await expect(manager.readConfig('')).rejects.toThrow('Invalid config filename');
  });
});

// ---------------------------------------------------------------------------
// No workspace
// ---------------------------------------------------------------------------

describe('no workspace', () => {
  test('throws when no workspace is set', async () => {
    const fresh = new ConfigManager();
    await expect(fresh.readConfig('settings.json')).rejects.toThrow('No workspace open');
  });
});
