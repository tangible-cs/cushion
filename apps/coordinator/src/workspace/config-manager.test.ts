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
// Snippets
// ---------------------------------------------------------------------------

describe('listSnippets', () => {
  test('returns empty array when no snippets dir', async () => {
    const result = await manager.listSnippets();
    expect(result).toEqual([]);
  });

  test('lists .css files only', async () => {
    const snippetsDir = path.join(tmpDir, '.cushion', 'snippets');
    await fs.mkdir(snippetsDir, { recursive: true });
    await fs.writeFile(path.join(snippetsDir, 'theme.css'), 'body{}');
    await fs.writeFile(path.join(snippetsDir, 'notes.txt'), 'not a snippet');
    await fs.writeFile(path.join(snippetsDir, 'dark.css'), ':root{}');

    const result = await manager.listSnippets();
    expect(result).toEqual(['dark.css', 'theme.css']);
  });
});

describe('readSnippet', () => {
  test('reads snippet content', async () => {
    const snippetsDir = path.join(tmpDir, '.cushion', 'snippets');
    await fs.mkdir(snippetsDir, { recursive: true });
    await fs.writeFile(path.join(snippetsDir, 'my-style.css'), 'body { color: red; }');

    const content = await manager.readSnippet('my-style.css');
    expect(content).toBe('body { color: red; }');
  });

  test('throws for missing snippet', async () => {
    await expect(manager.readSnippet('nope.css')).rejects.toThrow('Snippet not found');
  });
});

describe('snippet name validation', () => {
  test('rejects path traversal', async () => {
    await expect(manager.readSnippet('../evil.css')).rejects.toThrow('path traversal');
  });

  test('rejects non-.css extension', async () => {
    await expect(manager.readSnippet('script.js')).rejects.toThrow('must end with .css');
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
