import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Credential } from '@cushion/types';

const CONFIG_DIR = path.join(os.homedir(), '.cushion');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LEGACY = 'ollama' + 'Config';

interface Config {
  credentials: Record<string, Credential>;
  syncedProviders?: string[];
  [key: string]: unknown;
}

function createConfig(): Config {
  return { credentials: {} };
}

function normalizeConfig(value: unknown): { cfg: Config; dirty: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { cfg: createConfig(), dirty: true };
  }

  const raw = value as Record<string, unknown>;
  const cfg: Config = {
    ...raw,
    credentials: raw.credentials && typeof raw.credentials === 'object' && !Array.isArray(raw.credentials)
      ? raw.credentials as Record<string, Credential>
      : {},
  };

  let syncedDirty = false;

  if (raw.syncedProviders === undefined) {
    delete cfg.syncedProviders;
  } else if (Array.isArray(raw.syncedProviders)) {
    syncedDirty = raw.syncedProviders.some((item) => typeof item !== 'string');
    cfg.syncedProviders = syncedDirty
      ? raw.syncedProviders.filter((item): item is string => typeof item === 'string')
      : raw.syncedProviders as string[];
  } else {
    syncedDirty = true;
    delete cfg.syncedProviders;
  }

  const dirty = LEGACY in cfg
    || cfg.credentials !== raw.credentials
    || syncedDirty;

  delete cfg[LEGACY];
  return { cfg, dirty };
}

export class CredentialStorage {
  private config: Config = createConfig();
  private ready: Promise<void>;
  private dir: string;
  private file: string;

  constructor(dir = CONFIG_DIR) {
    this.dir = dir;
    this.file = dir === CONFIG_DIR ? CONFIG_FILE : path.join(dir, 'config.json');
    this.ready = this.loadConfig();
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true }).catch(() => {});
  }

  private async loadConfig(): Promise<void> {
    try {
      await this.ensureConfigDir();
      const content = await fs.readFile(this.file, 'utf-8');
      const next = normalizeConfig(JSON.parse(content));
      this.config = next.cfg;
      if (next.dirty) await this.saveConfig();
    } catch {
      this.config = createConfig();
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await this.ensureConfigDir();
      delete this.config[LEGACY];
      await fs.writeFile(this.file, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CredentialStorage] Failed to save config:', error);
      throw error;
    }
  }

  async setCredential(providerID: string, apiKey: string): Promise<void> {
    await this.ensureReady();
    this.config.credentials[providerID] = {
      providerID,
      auth: {
        type: 'api',
        key: apiKey,
      },
    };
    await this.saveConfig();
  }

  async setOAuthCredential(providerID: string, auth: {
    access: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
  }): Promise<void> {
    await this.ensureReady();
    this.config.credentials[providerID] = {
      providerID,
      auth: {
        type: 'oauth',
        ...auth,
      },
    };
    await this.saveConfig();
  }

  async getCredential(providerID: string): Promise<Credential | undefined> {
    await this.ensureReady();
    return this.config.credentials[providerID];
  }

  async removeCredential(providerID: string): Promise<void> {
    await this.ensureReady();
    delete this.config.credentials[providerID];
    await this.saveConfig();
  }

  async getAllCredentials(): Promise<Credential[]> {
    await this.ensureReady();
    return Object.values(this.config.credentials);
  }

  async getConnectedProviderIDs(): Promise<string[]> {
    await this.ensureReady();
    return Object.keys(this.config.credentials);
  }

  async hasCredential(providerID: string): Promise<boolean> {
    await this.ensureReady();
    return providerID in this.config.credentials;
  }

  async getSyncedProviders(): Promise<string[]> {
    await this.ensureReady();
    return this.config.syncedProviders ?? [];
  }

  async setSyncedProviders(ids: string[]): Promise<void> {
    await this.ensureReady();
    this.config.syncedProviders = ids;
    await this.saveConfig();
  }
}
