import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import path from 'path';
import https from 'https';
import { app } from 'electron';
import type { DictationModelName, DictationModelInfo } from '@cushion/types';
import { SHERPA_MODEL_CATALOG, type SherpaModelEntry } from './sherpa-model-catalog';
import { extractTarBz2 } from './tar-utils';

const MAX_REDIRECTS = 5;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const STALL_TIMEOUT_MS = 30_000;
const PROGRESS_THROTTLE_MS = 100;
const STALE_TMP_MS = 24 * 60 * 60 * 1000;
const ALLOWED_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

type NotifyFn = (channel: string, data: unknown) => void;

export class SherpaModelManager {
  private modelsDir: string;
  private notify: NotifyFn;
  private activeAbort: AbortController | null = null;
  private activeModel: DictationModelName | null = null;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.modelsDir = path.join(app.getPath('userData'), 'models', 'sherpa');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.modelsDir, { recursive: true });
    await this.cleanStaleTmpFiles();
  }

  getModelsDir(): string {
    return this.modelsDir;
  }

  async listAllModels(): Promise<DictationModelInfo[]> {
    const models: DictationModelInfo[] = [];
    for (const [name, entry] of Object.entries(SHERPA_MODEL_CATALOG) as [DictationModelName, SherpaModelEntry][]) {
      const modelDir = path.join(this.modelsDir, name);
      let downloaded = false;
      try {
        const checks = entry.requiredFiles.map(f => fs.access(path.join(modelDir, f)));
        await Promise.all(checks);
        downloaded = true;
      } catch {}
      models.push({
        name,
        label: entry.label,
        description: entry.description,
        engineType: entry.engineType,
        sizeMb: entry.sizeMb,
        languages: entry.languages,
        downloaded,
        category: entry.category,
        speedScore: entry.speedScore,
        accuracyScore: entry.accuracyScore,
        isRecommended: entry.isRecommended,
      });
    }
    return models;
  }

  isModelDownloaded(model: DictationModelName): boolean {
    const entry = SHERPA_MODEL_CATALOG[model];
    if (!entry) return false;
    const modelDir = path.join(this.modelsDir, model);
    return entry.requiredFiles.every(f => existsSync(path.join(modelDir, f)));
  }

  getModelDir(model: DictationModelName): string {
    return path.join(this.modelsDir, model);
  }

  async downloadModel(model: DictationModelName): Promise<{ success: boolean }> {
    if (this.activeAbort) throw new Error('A download is already in progress');

    const key = model;
    const entry = SHERPA_MODEL_CATALOG[key];
    if (!entry) throw new Error(`Unknown model: ${model}`);

    if (this.isModelDownloaded(model)) {
      return { success: true };
    }

    const abort = new AbortController();
    this.activeAbort = abort;
    this.activeModel = model;

    const archivePath = path.join(this.modelsDir, `${model}.tar.bz2`);
    const extractDir = path.join(this.modelsDir, `temp-extract-${model}`);

    try {
      // Check disk space
      try {
        const stats = await fs.statfs(this.modelsDir);
        const freeBytes = stats.bfree * stats.bsize;
        const requiredBytes = entry.sizeMb * 1024 * 1024 * 2.5; // archive + extracted
        if (freeBytes < requiredBytes) {
          throw new Error(`Not enough disk space. Need ~${Math.round(requiredBytes / 1024 / 1024)}MB, have ~${Math.floor(freeBytes / 1024 / 1024)}MB`);
        }
      } catch (err: any) {
        if (err.message?.startsWith('Not enough')) throw err;
      }

      // Download with retry
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (abort.signal.aborted) throw new Error('Download cancelled');
        try {
          await this.downloadFile(entry.downloadUrl, archivePath, key, entry.sizeMb, abort.signal);
          break;
        } catch (err: any) {
          if (abort.signal.aborted) throw err;
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }
          throw err;
        }
      }

      // Extract
      await fs.mkdir(extractDir, { recursive: true });
      await extractTarBz2(archivePath, extractDir);

      // Move extracted dir to final location
      const targetDir = path.join(this.modelsDir, model);
      const extractedDir = path.join(extractDir, entry.extractDir);

      if (existsSync(extractedDir)) {
        if (existsSync(targetDir)) {
          await fs.rm(targetDir, { recursive: true, force: true });
        }
        await fs.rename(extractedDir, targetDir);
      } else {
        // Fallback: find a directory that looks right
        const entries = await fs.readdir(extractDir);
        const found = entries.find(e => {
          try { return require('fs').statSync(path.join(extractDir, e)).isDirectory(); } catch { return false; }
        });
        if (found) {
          if (existsSync(targetDir)) {
            await fs.rm(targetDir, { recursive: true, force: true });
          }
          await fs.rename(path.join(extractDir, found), targetDir);
        } else {
          throw new Error(`Could not find model directory in archive. Expected "${entry.extractDir}", found: [${entries.join(', ')}]`);
        }
      }

      // Validate
      const missing = entry.requiredFiles.filter(f => !existsSync(path.join(targetDir, f)));
      if (missing.length > 0) {
        throw new Error(`Extracted model is missing required files: ${missing.join(', ')}`);
      }

      // Cleanup
      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });

      this.notify('dictation/download-complete', { model });
      return { success: true };
    } catch (err: any) {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(archivePath, { force: true }).catch(() => {});
      const errorMsg = abort.signal.aborted ? 'Download cancelled' : err.message;
      this.notify('dictation/download-error', { model, error: errorMsg });
      throw err;
    } finally {
      this.activeAbort = null;
      this.activeModel = null;
    }
  }

  cancelDownload(): { cancelled: boolean } {
    if (this.activeAbort) {
      this.activeAbort.abort();
      return { cancelled: true };
    }
    return { cancelled: false };
  }

  async deleteModel(model: DictationModelName): Promise<{ success: boolean }> {
    const entry = SHERPA_MODEL_CATALOG[model];
    if (!entry) throw new Error(`Unknown model: ${model}`);
    await fs.rm(path.join(this.modelsDir, model), { recursive: true, force: true });
    return { success: true };
  }

  dispose(): void {
    this.activeAbort?.abort();
  }

  private async cleanStaleTmpFiles(): Promise<void> {
    try {
      const entries = await fs.readdir(this.modelsDir);
      const now = Date.now();
      for (const entry of entries) {
        if (!entry.startsWith('temp-') && !entry.endsWith('.tar.bz2')) continue;
        const fullPath = path.join(this.modelsDir, entry);
        try {
          const stat = await fs.stat(fullPath);
          if (now - stat.mtimeMs > STALE_TMP_MS) {
            await fs.rm(fullPath, { recursive: true, force: true });
          }
        } catch {}
      }
    } catch {}
  }

  private downloadFile(
    url: string,
    destPath: string,
    model: DictationModelName,
    expectedSizeMb: number,
    signal: AbortSignal,
  ): Promise<void> {
    return this.downloadWithRedirects(url, destPath, model, expectedSizeMb, signal, 0);
  }

  private downloadWithRedirects(
    url: string,
    destPath: string,
    model: DictationModelName,
    expectedSizeMb: number,
    signal: AbortSignal,
    redirectCount: number,
  ): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) return Promise.reject(new Error('Too many redirects'));

    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Download cancelled'));

      const req = https.get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          try {
            const redirectUrl = new URL(res.headers.location);
            if (!ALLOWED_REDIRECT_HOSTS.has(redirectUrl.hostname)) {
              reject(new Error(`Redirect to unexpected host: ${redirectUrl.hostname}`));
              return;
            }
          } catch {
            reject(new Error('Invalid redirect URL'));
            return;
          }
          this.downloadWithRedirects(res.headers.location, destPath, model, expectedSizeMb, signal, redirectCount + 1)
            .then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10) || expectedSizeMb * 1024 * 1024;
        let downloadedBytes = 0;
        let lastProgressTime = 0;
        let lastSpeedBytes = 0;
        let lastSpeedTime = Date.now();
        let currentBytesPerSec = 0;
        let stallTimer: ReturnType<typeof setTimeout>;

        const resetStallTimer = () => {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => {
            req.destroy(new Error('Download stalled'));
          }, STALL_TIMEOUT_MS);
        };

        resetStallTimer();

        const writeStream = createWriteStream(destPath);

        const onAbort = () => {
          clearTimeout(stallTimer);
          req.destroy();
          writeStream.destroy();
          reject(new Error('Download cancelled'));
        };
        signal.addEventListener('abort', onAbort, { once: true });

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          resetStallTimer();

          const now = Date.now();
          if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
            const elapsed = (now - lastSpeedTime) / 1000;
            if (elapsed > 0) {
              currentBytesPerSec = Math.round((downloadedBytes - lastSpeedBytes) / elapsed);
              lastSpeedBytes = downloadedBytes;
              lastSpeedTime = now;
            }
            lastProgressTime = now;
            this.notify('dictation/download-progress', {
              model,
              downloadedBytes,
              totalBytes,
              percent: Math.round((downloadedBytes / totalBytes) * 100),
              bytesPerSec: currentBytesPerSec,
            });
          }
        });

        res.pipe(writeStream);

        writeStream.on('finish', () => {
          clearTimeout(stallTimer);
          signal.removeEventListener('abort', onAbort);
          this.notify('dictation/download-progress', {
            model,
            downloadedBytes,
            totalBytes,
            percent: 100,
            bytesPerSec: 0,
          });
          resolve();
        });

        writeStream.on('error', (err) => {
          clearTimeout(stallTimer);
          signal.removeEventListener('abort', onAbort);
          reject(err);
        });

        res.on('error', (err) => {
          clearTimeout(stallTimer);
          signal.removeEventListener('abort', onAbort);
          writeStream.destroy();
          reject(err);
        });
      });

      req.on('error', reject);
    });
  }
}
