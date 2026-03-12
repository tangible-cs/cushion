/**
 * Ollama Removal Plan — Frontend verification tests
 *
 * These tests verify the *behavioral contracts* after each removal phase,
 * not just that code was deleted.  They import real modules, read real
 * source files, and assert that the system flows work without Ollama.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ── helpers ──────────────────────────────────────────────────────────

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(FRONTEND_ROOT, '..', '..');

/** Read a file relative to the monorepo root, returning null if absent. */
function readSource(relPath: string): string | null {
  const abs = path.resolve(REPO_ROOT, relPath);
  try {
    return fs.readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
}

/** Check whether a file exists relative to the monorepo root. */
function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(REPO_ROOT, relPath));
}

// =====================================================================
// Phase 1 — Frontend entry points removed
// =====================================================================

describe('Phase 1: frontend entry points removed', () => {
  // -- LocalAIButton completely gone ----------------------------------

  it('LocalAIButton.tsx no longer exists', () => {
    expect(fileExists('apps/frontend/components/chat/LocalAIButton.tsx')).toBe(false);
  });

  it('PromptInput does not import or reference LocalAIButton', () => {
    const src = readSource('apps/frontend/components/chat/PromptInput.tsx');
    expect(src).not.toBeNull();
    expect(src).not.toContain('LocalAIButton');
  });

  // -- ConnectProviderDialog has no Ollama branch ----------------------

  it('ConnectProviderDialog has no Ollama-specific connect flow', () => {
    const src = readSource('apps/frontend/components/chat/ConnectProviderDialog.tsx');
    expect(src).not.toBeNull();
    // No Ollama health checking, no Ollama connect handler, no isOllama guard
    expect(src).not.toContain('checkOllamaHealth');
    expect(src).not.toContain('handleOllamaConnect');
    expect(src).not.toContain('isOllama');
  });

  // -- ModelSelector has no Ollama-only badge --------------------------

  it('ModelSelector does not render an Ollama-specific Local badge', () => {
    const src = readSource('apps/frontend/components/chat/ModelSelector.tsx');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/isOllama/);
    // The specific "Local" badge text tied to Ollama should be gone.
    // Generic "Local" text might exist for other reasons, but the
    // providerID === 'ollama' check must be absent.
    expect(src).not.toMatch(/providerID\s*===?\s*['"]ollama['"]/);
  });

  // -- POPULAR_PROVIDERS no longer includes 'ollama' -------------------

  it('frontend model-constants.ts does not reference ollama', () => {
    const src = readSource('apps/frontend/lib/model-constants.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain("'ollama'");
  });

  // -- ManageModelsDialog & SelectProviderDialog are Ollama-free -------

  it('ManageModelsDialog has no Ollama-specific code', () => {
    const src = readSource('apps/frontend/components/chat/ManageModelsDialog.tsx');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/providerID\s*===?\s*['"]ollama['"]/);
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
  });

  it('SelectProviderDialog has no custom Ollama provider entry', () => {
    const src = readSource('apps/frontend/components/chat/SelectProviderDialog.tsx');
    expect(src).not.toBeNull();
    // ollama-cloud is fine (OpenCode-owned), but plain 'ollama' should not be
    // in RECOMMENDED_PROVIDER_IDS or PROVIDER_DESCRIPTIONS.
    expect(src).not.toMatch(/['"]ollama['"]\s*[,\]]/);
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
  });
});

// =====================================================================
// Phase 2 — Client wrappers removed, RPC types deferred
// =====================================================================

describe('Phase 2: client wrappers removed', () => {
  it('coordinator-client.ts exposes no Ollama RPC wrapper methods', () => {
    const src = readSource('apps/frontend/lib/coordinator-client.ts');
    expect(src).not.toBeNull();

    // None of the dedicated Ollama methods should exist
    expect(src).not.toContain('listOllamaModels');
    expect(src).not.toContain('pullOllamaModel');
    expect(src).not.toContain('deleteOllamaModel');
    expect(src).not.toContain('writeOllamaConfig');
  });

  it('coordinator-client.ts does not reference provider/ollama/ RPC names', () => {
    const src = readSource('apps/frontend/lib/coordinator-client.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('provider/ollama/');
  });

  it('CoordinatorClient still has generic provider RPC wrappers', () => {
    const src = readSource('apps/frontend/lib/coordinator-client.ts');
    expect(src).not.toBeNull();
    // The generic provider wrappers must survive
    expect(src).toContain('listProviders');
    expect(src).toContain('setProviderAuth');
    expect(src).toContain('removeProviderAuth');
    expect(src).toContain('syncProviders');
    expect(src).toContain('authorizeOAuth');
    expect(src).toContain('oauthCallback');
  });

  it('no frontend file outside coordinator-client.ts calls Ollama RPCs', () => {
    // Walk every .ts/.tsx file in the frontend and make sure none reference
    // the Ollama RPC method names as strings.
    const frontendSrc = path.resolve(REPO_ROOT, 'apps/frontend');

    function walk(dir: string): string[] {
      const results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
          results.push(...walk(full));
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          results.push(full);
        }
      }
      return results;
    }

    for (const file of walk(frontendSrc)) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(frontendSrc, file);
      // Allow the test file itself to mention these strings
      if (rel.includes('ollama-removal.test')) continue;
      expect(content, `${rel} still references provider/ollama/`).not.toContain('provider/ollama/');
    }
  });
});

// =====================================================================
// Phase 3 — Coordinator RPC handling removed
// (will fail until Phase 3 is implemented)
// =====================================================================

describe('Phase 3: coordinator RPC handling removed', () => {
  it('server.ts does not import Ollama handler functions', () => {
    const src = readSource('apps/coordinator/src/server.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('handleOllamaList');
    expect(src).not.toContain('handleOllamaPull');
    expect(src).not.toContain('handleOllamaDelete');
    expect(src).not.toContain('handleOllamaWriteConfig');
  });

  it('server.ts has no provider/ollama/* switch cases', () => {
    const src = readSource('apps/coordinator/src/server.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain("'provider/ollama/");
  });

  it('provider handler has no Ollama-specific handler functions', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/export\s+async\s+function\s+handleOllama/);
  });

  it('handleProviderAuthSet has no Ollama branch', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
    expect(src).not.toContain('connectOllama');
    expect(src).not.toContain('validateOllamaConnection');
  });

  it('handleProviderAuthRemove has no Ollama branch', () => {
    const src = readSource('apps/coordinator/src/handlers/provider.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('disconnectOllama');
  });

  it('RPC type definitions for provider/ollama/* are removed', () => {
    const src = readSource('packages/types/src/rpc.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain("'provider/ollama/");
  });
});

// =====================================================================
// Phase 4 — Synthetic provider injection & custom storage removed
// (will fail until Phase 4 is implemented)
// =====================================================================

describe('Phase 4: synthetic provider injection removed', () => {
  it('registry.ts does not import from ./ollama', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    expect(src).not.toMatch(/from\s+['"]\.\/ollama/);
  });

  it('registry POPULAR_PROVIDERS does not include ollama', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    // 'ollama' as a standalone popular provider should be gone.
    // 'ollama-cloud' is fine.
    expect(src).not.toMatch(/['"]ollama['"]\s*[,\]]/);
  });

  it('registry does not call createOllamaProvider', () => {
    const src = readSource('apps/coordinator/src/providers/registry.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('createOllamaProvider');
  });

  it('storage.ts has no ollamaConfig field or Ollama methods', () => {
    const src = readSource('apps/coordinator/src/providers/storage.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('ollamaConfig');
    expect(src).not.toContain('connectOllama');
    expect(src).not.toContain('disconnectOllama');
    expect(src).not.toContain('isOllamaConnected');
    expect(src).not.toContain('getOllamaBaseUrl');
    expect(src).not.toContain('getOllamaConfig');
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
  });

  it('storage getConnectedProviderIDs only reflects real credentials', () => {
    const src = readSource('apps/coordinator/src/providers/storage.ts');
    expect(src).not.toBeNull();
    // The method should no longer check for ollamaConfig.connected
    expect(src).not.toMatch(/ollamaConfig.*connected/);
  });

  it('credential-sync.ts no longer imports OLLAMA_PROVIDER_ID', () => {
    const src = readSource('apps/coordinator/src/providers/credential-sync.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('OLLAMA_PROVIDER_ID');
  });
});

// =====================================================================
// Phase 5 — Standalone Ollama files deleted
// (will fail until Phase 5 is implemented)
// =====================================================================

describe('Phase 5: standalone Ollama files deleted', () => {
  it('ollama.ts is deleted', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama.ts')).toBe(false);
  });

  it('ollama-discover.ts is deleted', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama-discover.ts')).toBe(false);
  });

  it('ollama-config.ts is deleted', () => {
    expect(fileExists('apps/coordinator/src/providers/ollama-config.ts')).toBe(false);
  });

  it('readOpenCodeConfig and getOpenCodeConfigPath are available from a non-Ollama module', () => {
    // credential-sync.ts should still import these helpers, but from a
    // shared module that is NOT ollama-config.ts
    const src = readSource('apps/coordinator/src/providers/credential-sync.ts');
    expect(src).not.toBeNull();
    expect(src).toContain('readOpenCodeConfig');
    expect(src).toContain('getOpenCodeConfigPath');
    expect(src).not.toMatch(/from\s+['"]\.\/ollama-config/);
  });
});

// =====================================================================
// Phase 6 — Tests and stale assets cleaned
// (will fail until Phase 6 is implemented)
// =====================================================================

describe('Phase 6: tests and stale assets cleaned', () => {
  it('storage.test.ts has no Ollama-specific test suite', () => {
    const src = readSource('apps/coordinator/src/providers/storage.test.ts');
    expect(src).not.toBeNull();
    expect(src).not.toContain('connectOllama');
    expect(src).not.toContain('disconnectOllama');
    expect(src).not.toContain('isOllamaConnected');
    expect(src).not.toContain('getOllamaBaseUrl');
    expect(src).not.toMatch(/describe.*ollama/i);
  });

  it('no non-opencode source file references custom Ollama layer strings', () => {
    // Walk all .ts files outside opencode/ and check for stale strings
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
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
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
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(REPO_ROOT, file);
      // Skip this test file itself
      if (rel.includes('ollama-removal.test')) continue;
      for (const s of staleStrings) {
        expect(content, `${rel} still contains "${s}"`).not.toContain(s);
      }
    }
  });

  it('ollama-cloud icon data is preserved in sprite.svg', () => {
    expect(fileExists('apps/frontend/public/provider-icons/sprite.svg')).toBe(true);
    const svg = readSource('apps/frontend/public/provider-icons/sprite.svg');
    expect(svg).not.toBeNull();
    expect(svg).toContain('ollama-cloud');
  });

  it('ollama-cloud is preserved in provider-icons types', () => {
    const src = readSource('apps/frontend/components/chat/provider-icons/types.ts');
    expect(src).not.toBeNull();
    expect(src).toContain('ollama-cloud');
  });
});
