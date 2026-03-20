/**
 * Credential Sync — writes Cushion-managed credentials into OpenCode's config
 *
 * When a user adds/removes an API key through Cushion, the credential is stored
 * in ~/.cushion/config.json. OpenCode reads provider keys from its own config at
 * ~/.config/opencode/opencode.json under `provider.<id>.options.apiKey`.
 *
 * This module bridges the gap by writing Cushion credentials into OpenCode's
 * config so that `client.config.providers()` returns the correct provider list.
 */

import { readOpenCodeConfig, getOpenCodeConfigPath } from './opencode-config.js';
import type { CredentialStorage } from './storage.js';

/**
 * Legacy marker key that was previously written into OpenCode provider entries.
 * Cleaned up on next sync to fix OpenCode config validation errors.
 */
const LEGACY_MARKER = '__cushion';
const LEGACY_PROVIDER = 'ollama';

/**
 * Syncs all Cushion-managed credentials into OpenCode's config file.
 *
 * - For `api` credentials: sets `options.apiKey`
 * - For `oauth` credentials: sets `options.apiKey` to the access token
 * - Removes provider entries that Cushion previously synced but whose
 *   credentials have been deleted (tracked via `syncedProviders` in
 *   Cushion's own config, not in OpenCode's config).
 * - Cleans up any legacy `__cushion` marker keys from OpenCode's config.
 */
export async function syncCredentialsToOpenCode(
  credentialStorage: CredentialStorage,
): Promise<void> {
  const credentials = await credentialStorage.getAllCredentials();
  const previouslySynced = new Set(await credentialStorage.getSyncedProviders());
  const config = await readOpenCodeConfig();

  const providerSection = (config.provider ?? {}) as Record<string, Record<string, unknown>>;

  const currentlySynced: string[] = [];

  for (const credential of credentials) {
    const apiKey =
      credential.auth.type === 'api'
        ? credential.auth.key
        : credential.auth.type === 'oauth'
          ? credential.auth.access
          : undefined;

    if (!apiKey) continue;

    currentlySynced.push(credential.providerID);

    const existing = providerSection[credential.providerID] ?? {};
    const existingOptions = (existing.options ?? {}) as Record<string, unknown>;

    providerSection[credential.providerID] = {
      ...existing,
      options: {
        ...existingOptions,
        apiKey,
      },
    };

    // Clean up legacy marker if present
    delete providerSection[credential.providerID][LEGACY_MARKER];
  }

  const managedIds = new Set(currentlySynced);
  delete providerSection[LEGACY_PROVIDER];

  // Remove stale entries: previously synced by Cushion but credential now deleted
  for (const providerID of previouslySynced) {
    if (managedIds.has(providerID)) continue;
    const entry = providerSection[providerID];
    if (!entry) continue;

    const options = (entry.options ?? {}) as Record<string, unknown>;
    delete options.apiKey;
    delete entry[LEGACY_MARKER];

    const remainingOptions = Object.keys(options).length;
    const remainingFields = Object.keys(entry).filter((k) => k !== 'options').length;
    if (remainingOptions === 0 && remainingFields === 0) {
      delete providerSection[providerID];
    } else if (remainingOptions === 0) {
      delete entry.options;
    }
  }

  // Clean up legacy markers from any provider entry (even ones not managed by Cushion)
  for (const entry of Object.values(providerSection)) {
    if (entry && LEGACY_MARKER in entry) {
      delete entry[LEGACY_MARKER];
    }
  }

  const mergedConfig = {
    ...config,
    provider: providerSection,
    // Ensure OpenCode asks for permissions so Cushion's auto-accept toggle works.
    // Only set the default if the user hasn't configured permissions themselves.
    ...(!config.permission ? { permission: { '*': 'ask' } } : {}),
  };

  const fs = await import('fs/promises');
  const pathMod = await import('path');
  const configPath = getOpenCodeConfigPath();
  const configDir = pathMod.dirname(configPath);
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(mergedConfig, null, 2), 'utf-8');

  await credentialStorage.setSyncedProviders(currentlySynced);
}
