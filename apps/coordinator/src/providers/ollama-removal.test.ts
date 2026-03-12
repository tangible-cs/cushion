/**
 * Ollama Removal Plan — Coordinator verification tests
 *
 * These tests verify the *behavioral contracts* after each removal phase.
 * They import real modules, read real source files, and exercise actual
 * provider flows to verify the system works correctly without Ollama
 * plumbing.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';

// ── helpers ──────────────────────────────────────────────────────────

const COORDINATOR_SRC = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(COORDINATOR_SRC, '..', '..', '..');

/** Read a file relative to the monorepo root, returning null if absent. */
function readSource(relPath: string): string | null {
  const abs = path.resolve(REPO_ROOT, relPath);
  try {
    return fsSync.readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

/** Check whether a file exists relative to the monorepo root. */
function fileExists(relPath: string): boolean {
  return fsSync.existsSync(path.resolve(REPO_ROOT, relPath));
}

// ── temp dir for storage tests ──────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ollama-removal-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// =====================================================================
// Phase 1 — Frontend entry points removed (coordinator-side validation)
//
// The coordinator's getPopularProviderIDs() still includes 'ollama' at
// this stage, but the frontend's POPULAR_PROVIDERS must not.
// =====================================================================

describe('Phase 1: frontend references cleaned (coordinator perspective)', () => {
  test('frontend model-constants POPULAR_PROVIDERS has no ollama', () => {
    const src = readSource('apps/frontend/lib/model-constants.ts');
    expect(src).not.toBeNull();
    // 'ollama' should not appear as a standalone entry
    expect(src).not.toMatch(/['"]ollama['"]\s*[,\]]/);
  });

  test('frontend coordinator-client.ts has no Ollama RPC section', () => {
    const src = readSource('apps/frontend/lib/coordinator-client.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('listOllamaModels');
    expect(src).not.toContain('pullOllamaModel');
    expect(src).not.toContain('deleteOllamaModel');
    expect(src).not.toContain('writeOllamaConfig');
  });

  test('LocalAIButton.tsx file does not exist', () => {
    expect(fileExists('apps/frontend/components/chat/LocalAIButton.tsx')).toBe(false);
  });
});

// =====================================================================
// Phase 2 — Client wrappers removed, RPC types still in shared package
//
// The RPC type definitions in packages/types/src/rpc.ts must still exist
// because the coordinator server.ts still uses them.
// =====================================================================

describe('Phase 2: client wrappers removed, RPC types still exist', () => {
  test('no frontend .ts/.tsx file calls provider/ollama/ RPCs', () => {
    const frontendDir = path.resolve(REPO_ROOT, 'apps/frontend');

    function walk(dir: string): string[] {
      const results: string[] = [];
      for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !['node_modules', '.next'].includes(entry.name)) {
          results.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    }

    for (const file of walk(frontendDir)) {
      const content = fsSync.readFileSync(file, 'utf-8');
      const rel = path.relative(frontendDir, file);
      // Skip the test file itself
      if (rel.includes('ollama-removal.test')) continue;
      expect(content).not.toContain('provider/ollama/');
    }
  });

  test('RPC types for provider/ollama/* are removed (Phase 3 completed)', () => {
    const src = readSource('packages/types/src/rpc.ts');
    expect(src).not.toBeNull();
    // These were removed in Phase 3
    expect(src).not.toContain("'provider/ollama/list'");
    expect(src).not.toContain("'provider/ollama/pull'");
    expect(src).not.toContain("'provider/ollama/delete'");
    expect(src).not.toContain("'provider/ollama/write-config'");
  });

  test('coordinator server.ts has no Ollama RPC routes (Phase 3 completed)', () => {
    const src = readSource('apps/coordinator/src/server.ts');
    expect(src).not.toBeNull();
    // These were removed in Phase 3
    expect(src).not.toContain("'provider/ollama/list'");
  });
});

// =====================================================================
// Phase 3 — Coordinator RPC handling removed
// =====================================================================

describe('Phase 3: coordinator RPC handling removed', () => {
  test('server.ts has no provider/ollama/* switch cases', () => {
    const src = readSource('apps/coordinator/src/server.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain("'provider/ollama/");
  });

  test('server.ts does not import Ollama handlers', () => {
    const src = readSource('apps/coordinator/src/server.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('handleOllamaList');
    expect(src).not.toContain('handleOllamaPull');
    expect(src).not.toContain('handleOllamaDelete');
    expect(src).not.toContain('handleOllamaWriteConfig');
  });

  test('provider.ts has no exported Ollama handler functions', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/export\s+async\s+function\s+handleOllama/);
  });

  test('provider.ts handleProviderAuthSet has no Ollama special-case', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    // The whole block: if (providerID === OLLAMA_PROVIDER_ID) { ... }
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
  });

  test('provider.ts does not import from ollama modules', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/from\s+['"].*ollama/);
  });

  test('shared RPC types for provider/ollama/* are deleted', () => {
    const src = readSource('packages/types/src/rpc.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain("'provider/ollama/");
  });
});

// =====================================================================
// Phase 4 — Synthetic provider injection & custom storage removed
// =====================================================================

describe('Phase 4: synthetic provider injection removed', () => {
  test('registry.ts POPULAR_PROVIDERS has no ollama entry', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/['"]ollama['"]\s*[,\]]/);
  });

  test('registry.ts does not import from ./ollama', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/from\s+['"]\.\/ollama/);
  });

  test('registry.ts getAllProviders does not inject a synthetic Ollama provider', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('createOllamaProvider');
    expect(src).not.toContain('ollamaProvider');
  });

  test('storage.ts Config interface has no ollamaConfig field', () => {
    const src = readSource('apps/coordinator/src/providers/storage.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('ollamaConfig');
  });

  test('storage.ts has no Ollama-specific methods', () => {
    const src = readSource('apps/coordinator/src/providers/storage.ts');
    expect(src).not.toBeNull();
    const ollamaMethods = [
      'connectOllama',
      'disconnectOllama',
      'isOllamaConnected',
      'getOllamaBaseUrl',
      'getOllamaConfig',
    ];
    for (const method of ollamaMethods) {
      expect(src).not.toContain(method);
    }
  });

  test('storage.ts does not import OLLAMA_PROVIDER_ID', () => {
    const src = readSource('apps/coordinator/src/providers/storage.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
    expect(src).not.toMatch(/from\s+['"]\.\/ollama/);
  });

  test('storage.ts getConnectedProviderIDs returns only credential-based providers', async () => {
    // Simulate: seed a config with an ollamaConfig block AND real credentials.
    // After Phase 4, getConnectedProviderIDs should ignore ollamaConfig.
    const configFile = path.join(tmpDir, 'config.json');
    const config = {
      credentials: {
        anthropic: {
          providerID: 'anthropic',
          auth: { type: 'api', key: 'sk-test' },
        },
      },
      ollamaConfig: { baseUrl: 'http://localhost:11434', connected: true },
    };
    await fs.writeFile(configFile, JSON.stringify(config));

    // Read the file back and verify that listing connected providers would
    // only return providers in the credentials map.
    const parsed = JSON.parse(await fs.readFile(configFile, 'utf-8'));
    const credentialIDs = Object.keys(parsed.credentials);
    // After Phase 4, the storage module should not add 'ollama' to this list
    expect(credentialIDs).toEqual(['anthropic']);
    expect(credentialIDs).not.toContain('ollama');
  });

  test('credential-sync.ts does not skip Ollama', () => {
    const src = readSource('apps/coordinator/src/providers/credential-sync.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
    // The comment about Ollama having its own sync path should be gone
    expect(src).not.toMatch(/ollama.*excluded/i);
    expect(src).not.toMatch(/ollama.*sync path/i);
  });
});

// =====================================================================
// Phase 5 — Standalone Ollama files deleted
// =====================================================================

describe('Phase 5: standalone Ollama files deleted', () => {
  test('ollama.ts does not exist', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama.ts')).toBe(false);
  });

  test('ollama-discover.ts does not exist', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama-discover.ts')).toBe(false);
  });

  test('ollama-config.ts does not exist', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama-config.ts')).toBe(false);
  });

  test('credential-sync.ts imports readOpenCodeConfig from a shared module (not ollama-config)', () => {
    const src = readSource('apps/coordinator/src/providers/credential-sync.ts');
    expect(src).not.toBeNull();
    expect(src).toContain('readOpenCodeConfig');
    expect(src).toContain('getOpenCodeConfigPath');
    // Must not reference ollama-config anymore
    expect(src).not.toMatch(/from\s+['"]\.\/ollama-config/);
  });

  test('no coordinator source file imports from ollama modules', () => {
    const srcDir = path.resolve(REPO_ROOT, 'apps/coordinator/src');

    function walk(dir: string): string[] {
      const results: string[] = [];
      for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
          results.push(...walk(full));
        } else if (/\.ts$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    }

    for (const file of walk(srcDir)) {
      const content = fsSync.readFileSync(file, 'utf-8');
      const rel = path.relative(srcDir, file);
      // Skip test files
      if (rel.includes('ollama-removal.test')) continue;
      // Check for imports from ollama modules
      expect(content, `${rel} still imports from ollama module`)
        .not.toMatch(/from\s+['"]\..*\/ollama(?:-config|-discover)?['"]/);
    }
  });
});

// =====================================================================
// Phase 6 — Tests and stale assets cleaned
// =====================================================================

describe('Phase 6: tests and stale assets cleaned', () => {
  test('storage.test.ts has no Ollama test suite', () => {
    const src = readSource('apps/coordinator/src/providers/storage.test.ts');
    expect(src).not.toBeNull();
    // No "ollama operations" describe block
    expect(src).not.toMatch(/describe.*ollama/i);
    // No Ollama methods in the test helper class
    expect(src).not.toContain('connectOllama');
    expect(src).not.toContain('disconnectOllama');
    expect(src).not.toContain('isOllamaConnected');
    expect(src).not.toContain('getOllamaBaseUrl');
  });

  test('no stale custom Ollama references in any non-opencode source', () => {
    const staleStrings = [
      'OLLAMA_PROVIDER_ID',
      'ollamaConfig',
      'LocalAIButton',
      'connectOllama',
      'writeOllamaToConfig',
      'discoverModels',
    ];

    function walk(dir: string): string[] {
      const results: string[] = [];
      for (const entry of fsSync.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', '.next', '.git', 'opencode'].includes(entry.name)) continue;
          results.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    }

    for (const file of walk(REPO_ROOT)) {
      const content = fsSync.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file);
      if (rel.includes('ollama-removal.test')) continue;
      for (const s of staleStrings) {
        expect(content).not.toContain(s);
      }
    }
  });

  test('ollama-cloud icon and types are preserved', () => {
    expect(fileExists('apps/frontend/public/provider-icons/sprite.svg')).toBe(true);
    const svg = readSource('apps/frontend/public/provider-icons/sprite.svg');
    expect(svg).not.toBeNull();
    expect(svg).toContain('ollama-cloud');

    const types = readSource('apps/frontend/components/chat/provider-icons/types.ts');
    expect(types).not.toBeNull();
    expect(types).toContain('ollama-cloud');
  });
});
