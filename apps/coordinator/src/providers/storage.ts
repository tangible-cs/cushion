import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Credential } from '@cushion/types';
import { OLLAMA_PROVIDER_ID, OLLAMA_DEFAULT_URL } from './ollama.js';

export { OLLAMA_PROVIDER_ID };

const CONFIG_DIR = path.join(os.homedir(), '.cushion');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
  credentials: Record<string, Credential>;
  ollamaConfig?: {
    baseUrl?: string;
    connected?: boolean;
    lastConnected?: number;
  };
  syncedProviders?: string[];
}

const DEFAULT_CONFIG: Config = {
  credentials: {},
};

export class CredentialStorage {
  private config: Config = DEFAULT_CONFIG;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.loadConfig();
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
  }

  private async loadConfig(): Promise<void> {
    try {
      await this.ensureConfigDir();
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(content);
    } catch {
      this.config = DEFAULT_CONFIG;
      await this.saveConfig();
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      await this.ensureConfigDir();
      await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
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
    const providerIDs = Object.keys(this.config.credentials);
    if (this.config.ollamaConfig?.connected === true) {
      providerIDs.push(OLLAMA_PROVIDER_ID);
    }
    return providerIDs;
  }

  async hasCredential(providerID: string): Promise<boolean> {
    await this.ensureReady();
    if (providerID === OLLAMA_PROVIDER_ID) {
      return this.config.ollamaConfig?.connected === true;
    }
    return providerID in this.config.credentials;
  }

  // --- Ollama-specific methods ---

  async connectOllama(baseUrl?: string): Promise<void> {
    await this.ensureReady();
    this.config.ollamaConfig = {
      baseUrl: baseUrl || OLLAMA_DEFAULT_URL,
      connected: true,
      lastConnected: Date.now(),
    };
    await this.saveConfig();
  }

  async disconnectOllama(): Promise<void> {
    await this.ensureReady();
    delete this.config.ollamaConfig;
    await this.saveConfig();
  }

  async isOllamaConnected(): Promise<boolean> {
    await this.ensureReady();
    return this.config.ollamaConfig?.connected === true;
  }

  async getOllamaBaseUrl(): Promise<string> {
    await this.ensureReady();
    return this.config.ollamaConfig?.baseUrl || OLLAMA_DEFAULT_URL;
  }

  async getOllamaConfig(): Promise<{ baseUrl?: string; connected?: boolean } | undefined> {
    await this.ensureReady();
    return this.config.ollamaConfig;
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
