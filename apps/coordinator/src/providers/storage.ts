/**
 * Credential Storage
 *
 * Stores provider API keys and OAuth tokens in a local config file
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Credential, ApiAuth, OAuthAuth } from '@cushion/types';

const CONFIG_DIR = path.join(os.homedir(), '.cushion');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const OLLAMA_PROVIDER_ID = 'ollama';

type AuthCredential = ApiAuth | OAuthAuth;

interface Config {
  credentials: Record<string, Credential>;
  ollamaConfig?: {
    baseUrl?: string;
    connected?: boolean;
    lastConnected?: number;
  };
}

const DEFAULT_CONFIG: Config = {
  credentials: {},
};

export class CredentialStorage {
  private config: Config = DEFAULT_CONFIG;

  constructor() {
    this.loadConfig();
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
  }

  private async loadConfig(): Promise<void> {
    try {
      await this.ensureConfigDir();
      const content = await fs.readFile(CONFIG_FILE, 'utf-8');
      this.config = JSON.parse(content);
    } catch (error) {
      console.log('[CredentialStorage] Config file not found, using defaults');
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
    // Special handling for Ollama - store URL in ollamaConfig
    if (providerID === OLLAMA_PROVIDER_ID) {
      this.config.ollamaConfig = {
        baseUrl: apiKey || 'http://localhost:11434',
        connected: true,
        lastConnected: Date.now(),
      };
    } else {
      // Regular providers - store API key
      this.config.credentials[providerID] = {
        providerID,
        auth: {
          type: 'api',
          key: apiKey,
        },
      };
    }
    await this.saveConfig();
    console.log(`[CredentialStorage] Credential stored for provider: ${providerID}`);
  }

  async setOAuthCredential(providerID: string, auth: {
    access: string;
    refresh?: string;
    expires?: number;
    accountId?: string;
  }): Promise<void> {
    this.config.credentials[providerID] = {
      providerID,
      auth: {
        type: 'oauth',
        ...auth,
      },
    };
    await this.saveConfig();
    console.log(`[CredentialStorage] OAuth credential stored for provider: ${providerID}`);
  }

  async getCredential(providerID: string): Promise<Credential | undefined> {
    // Special handling for Ollama
    if (providerID === OLLAMA_PROVIDER_ID && this.config.ollamaConfig?.connected) {
      return {
        providerID,
        auth: {
          type: 'api',
          key: this.config.ollamaConfig.baseUrl || 'http://localhost:11434',
        },
      };
    }
    return this.config.credentials[providerID];
  }

  async removeCredential(providerID: string): Promise<void> {
    // Special handling for Ollama
    if (providerID === OLLAMA_PROVIDER_ID) {
      delete this.config.ollamaConfig;
    } else {
      delete this.config.credentials[providerID];
    }
    await this.saveConfig();
    console.log(`[CredentialStorage] Credential removed for provider: ${providerID}`);
  }

  async getAllCredentials(): Promise<Credential[]> {
    const credentials = Object.values(this.config.credentials);
    
    // Add Ollama if connected
    if (this.config.ollamaConfig?.connected) {
      credentials.push({
        providerID: OLLAMA_PROVIDER_ID,
        auth: {
          type: 'api',
          key: this.config.ollamaConfig.baseUrl || 'http://localhost:11434',
        },
      });
    }
    
    return credentials;
  }

  async getConnectedProviderIDs(): Promise<string[]> {
    const providerIDs = Object.keys(this.config.credentials);
    
    // Add Ollama if connected
    if (this.config.ollamaConfig?.connected) {
      providerIDs.push(OLLAMA_PROVIDER_ID);
    }
    
    return providerIDs;
  }

  hasCredential(providerID: string): boolean {
    // Special handling for Ollama
    if (providerID === OLLAMA_PROVIDER_ID) {
      return this.config.ollamaConfig?.connected === true;
    }
    return providerID in this.config.credentials;
  }

  async getOllamaConfig(): Promise<{ baseUrl?: string; connected?: boolean } | undefined> {
    return this.config.ollamaConfig;
  }
}
