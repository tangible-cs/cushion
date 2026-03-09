import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ConfigManager } from './config-manager';

let manager: ConfigManager;
let tmpDir: string;

beforeEach(async () => {
  manager = new ConfigManager();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cushion-config-extra-'));
  manager.setWorkspacePath(tmpDir);
});

afterEach(async () => {
  manager.clearWorkspacePath();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// .gitignore auto-generation
// ---------------------------------------------------------------------------

describe('.gitignore auto-generation', () => {
  test('writeConfig creates .gitignore on first write', async () => {
    await manager.writeConfig('settings.json', '{}');

    const gitignore = await fs.readFile(
      path.join(tmpDir, '.cushion', '.gitignore'),
      'utf-8'
    );
    expect(gitignore).toContain('workspace.json');
  });

  test('.gitignore is not overwritten if it already exists', async () => {
    // Create .cushion and a custom .gitignore
    const configDir = path.join(tmpDir, '.cushion');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, '.gitignore'), 'my-custom-ignore\n');

    // Trigger a write (which calls ensureConfigDir → ensureGitignore)
    await manager.writeConfig('settings.json', '{}');

    const gitignore = await fs.readFile(
      path.join(configDir, '.gitignore'),
      'utf-8'
    );
    expect(gitignore).toBe('my-custom-ignore\n');
  });

  test('.gitignore created only once per workspace session', async () => {
    await manager.writeConfig('settings.json', '{}');

    // Delete gitignore manually
    await fs.unlink(path.join(tmpDir, '.cushion', '.gitignore'));

    // Second write should not recreate it (cached flag)
    await manager.writeConfig('appearance.json', '{}');

    const exists = await fs.access(path.join(tmpDir, '.cushion', '.gitignore')).then(
      () => true,
      () => false
    );
    expect(exists).toBe(false);
  });

  test('flag resets on setWorkspacePath', async () => {
    await manager.writeConfig('settings.json', '{}');
    await fs.unlink(path.join(tmpDir, '.cushion', '.gitignore'));

    // Re-set workspace path (simulates workspace switch)
    manager.setWorkspacePath(tmpDir);
    await manager.writeConfig('settings.json', '{}');

    const exists = await fs.access(path.join(tmpDir, '.cushion', '.gitignore')).then(
      () => true,
      () => false
    );
    expect(exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConfigWatcher integration (self-write suppression)
// ---------------------------------------------------------------------------

describe('ConfigWatcher integration', () => {
  test('writeConfig calls suppressNext on linked watcher', async () => {
    const suppressed: string[] = [];
    const mockWatcher = {
      suppressNext: (filename: string) => suppressed.push(filename),
    };
    manager.setConfigWatcher(mockWatcher as any);

    await manager.writeConfig('settings.json', '{}');

    expect(suppressed).toEqual(['settings.json']);
  });

  test('writeConfig works without a watcher set', async () => {
    // No watcher linked — should not throw
    await manager.writeConfig('settings.json', '{}');

    const result = await manager.readConfig('settings.json');
    expect(result.exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clearWorkspacePath
// ---------------------------------------------------------------------------

describe('clearWorkspacePath', () => {
  test('operations fail after clearing workspace', async () => {
    manager.clearWorkspacePath();
    await expect(manager.readConfig('settings.json')).rejects.toThrow('No workspace open');
    await expect(manager.writeConfig('settings.json', '{}')).rejects.toThrow('No workspace open');
  });
});
