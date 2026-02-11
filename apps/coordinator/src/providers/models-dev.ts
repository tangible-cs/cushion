/**
 * Models.dev Integration
 *
 * Fetches and caches provider/model data from models.dev API
 * Matches OpenCode's approach: https://github.com/opencode-ai/opencode
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const CACHE_DIR = path.join(os.homedir(), '.cushion');
const CACHE_FILE = path.join(CACHE_DIR, 'models.json');
const MODELS_DEV_URL = 'https://models.dev/api.json';

// Models.dev API response types (simplified)
interface ModelsDevProvider {
  id: string;
  name: string;
  env: string[];
  models: Record<string, {
    id: string;
    name: string;
    reasoning: boolean | { field: string };
    temperature: boolean;
    cost?: {
      input: number;
      output: number;
      cache_read?: number;
      cache_write?: number;
      context_over_200k?: {
        input: number;
        output: number;
      };
    };
    limit?: {
      context: number;
      input?: number;
      output?: number;
    };
    modalities?: {
      input: string[];
      output: string[];
    };
  }>;
  auth_methods?: Array<{ type: string; label: string }>;
}

interface ModelsDevResponse {
  [providerID: string]: ModelsDevProvider;
}

export class ModelsDevCache {
  private cache: ModelsDevResponse = {};
  private lastFetch: number = 0;
  private cacheDuration = 60 * 60 * 1000; // 1 hour in milliseconds
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadCache();
    this.startAutoRefresh();
  }

  private async ensureCacheDir(): Promise<void> {
    await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
  }

  private async loadCache(): Promise<void> {
    try {
      await this.ensureCacheDir();
      const content = await fs.readFile(CACHE_FILE, 'utf-8');
      this.cache = JSON.parse(content);
      const stats = await fs.stat(CACHE_FILE);
      this.lastFetch = stats.mtimeMs;
      console.log('[ModelsDev] Cache loaded from disk');
    } catch (error) {
      console.log('[ModelsDev] Cache not found, will fetch fresh data');
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await this.ensureCacheDir();
      await fs.writeFile(CACHE_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
      this.lastFetch = Date.now();
      console.log('[ModelsDev] Cache saved to disk');
    } catch (error) {
      console.error('[ModelsDev] Failed to save cache:', error);
    }
  }

  async refresh(): Promise<void> {
    try {
      console.log('[ModelsDev] Fetching fresh data from models.dev...');

      const response = await fetch(MODELS_DEV_URL, {
        headers: {
          'User-Agent': 'Cushion/0.1.0',
        },
        signal: AbortSignal.timeout(10 * 1000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to fetch models.dev`);
      }

      const data: ModelsDevResponse = await response.json();

      this.cache = data;
      await this.saveCache();

      console.log(`[ModelsDev] Refreshed ${Object.keys(data).length} providers from models.dev`);
    } catch (error) {
      console.error('[ModelsDev] Failed to refresh cache:', error);
      // Don't throw - use cached data as fallback
    }
  }

  private startAutoRefresh(): void {
    // Refresh every hour (matching OpenCode)
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.cacheDuration);
  }

  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  isCacheStale(): boolean {
    return Date.now() - this.lastFetch > this.cacheDuration;
  }

  async getProviders(): Promise<ModelsDevResponse> {
    // Auto-refresh if cache is stale
    if (this.isCacheStale()) {
      await this.refresh();
    }

    return this.cache;
  }

  getProvider(providerID: string): ModelsDevProvider | undefined {
    return this.cache[providerID];
  }

  getModels(): Record<string, ModelsDevProvider> {
    return this.cache;
  }
}

let cacheInstance: ModelsDevCache | null = null;

export function getModelsDevCache(): ModelsDevCache {
  if (!cacheInstance) {
    cacheInstance = new ModelsDevCache();
  }
  return cacheInstance;
}
