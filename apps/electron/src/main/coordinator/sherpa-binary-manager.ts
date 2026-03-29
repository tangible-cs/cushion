import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { execFile } from 'child_process';
import https from 'https';
import path from 'path';
import { app } from 'electron';
import { extractTarBz2 } from './tar-utils';

const SHERPA_ONNX_VERSION = '1.12.23';
const GITHUB_RELEASE_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/v${SHERPA_ONNX_VERSION}`;

interface BinaryConfig {
  archiveName: string;
  binaryName: string;
  outputName: string;
  libPattern: RegExp;
}

const BINARIES: Record<string, BinaryConfig> = {
  'darwin-arm64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-osx-universal2-shared.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server',
    outputName: 'sherpa-onnx-ws-darwin-arm64',
    libPattern: /\.dylib$/,
  },
  'darwin-x64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-osx-universal2-shared.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server',
    outputName: 'sherpa-onnx-ws-darwin-x64',
    libPattern: /\.dylib$/,
  },
  'win32-x64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-win-x64-shared.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server.exe',
    outputName: 'sherpa-onnx-ws-win32-x64.exe',
    libPattern: /\.dll$/,
  },
  'linux-x64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-linux-x64-shared.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server',
    outputName: 'sherpa-onnx-ws-linux-x64',
    libPattern: /\.so(\.\d+)*$/,
  },
};

const GPU_BINARIES: Record<string, BinaryConfig> = {
  'win32-x64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-win-x64-cuda.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server.exe',
    outputName: 'sherpa-onnx-ws-win32-x64-gpu.exe',
    libPattern: /\.dll$/,
  },
  'linux-x64': {
    archiveName: `sherpa-onnx-v${SHERPA_ONNX_VERSION}-linux-x64-gpu.tar.bz2`,
    binaryName: 'sherpa-onnx-offline-websocket-server',
    outputName: 'sherpa-onnx-ws-linux-x64-gpu',
    libPattern: /\.so(\.\d+)*$/,
  },
};

const MAX_REDIRECTS = 5;
const ALLOWED_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

type NotifyFn = (channel: string, data: unknown) => void;

export class SherpaBinaryManager {
  private binDir: string;
  private notify: NotifyFn;
  private cudaAvailable: boolean | null = null;
  private gpuName: string | null = null;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.binDir = path.join(app.getPath('userData'), 'bin', 'sherpa');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.binDir, { recursive: true });
    await fs.mkdir(path.join(this.binDir, 'gpu'), { recursive: true });
    if (GPU_BINARIES[this.getBinaryKey()]) {
      await this.detectCuda();
    }
  }

  private getBinaryKey(): string {
    return `${process.platform}-${process.arch}`;
  }

  private getConfig(): BinaryConfig | null {
    return BINARIES[this.getBinaryKey()] ?? null;
  }

  private getOutputPath(): string | null {
    const config = this.getConfig();
    if (!config) return null;
    return path.join(this.binDir, config.outputName);
  }

  isBinaryAvailable(): { available: boolean; path: string | null } {
    const outputPath = this.getOutputPath();
    if (!outputPath) return { available: false, path: null };
    if (existsSync(outputPath)) return { available: true, path: outputPath };
    return { available: false, path: null };
  }

  async ensureBinary(): Promise<{ path: string }> {
    const status = this.isBinaryAvailable();
    if (status.available && status.path) return { path: status.path };
    return this.downloadBinary();
  }

  async downloadBinary(): Promise<{ path: string }> {
    const config = this.getConfig();
    if (!config) throw new Error(`Unsupported platform/arch: ${this.getBinaryKey()}`);
    return this._downloadVariant(config, this.binDir, 'dictation/binary-download');
  }

  isGpuSupported(): boolean {
    return GPU_BINARIES[this.getBinaryKey()] !== undefined && this.cudaAvailable === true;
  }

  getGpuName(): string | null {
    return this.gpuName;
  }

  /** Probe for NVIDIA GPU via nvidia-smi */
  private detectCuda(): Promise<void> {
    return new Promise((resolve) => {
      const bin = process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi';
      execFile(bin, ['--query-gpu=name', '--format=csv,noheader'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        const name = stdout?.trim().split('\n')[0]?.trim();
        this.cudaAvailable = !err && !!name;
        this.gpuName = this.cudaAvailable ? name! : null;
        resolve();
      });
    });
  }

  isGpuBinaryAvailable(): { available: boolean; path: string | null } {
    const config = GPU_BINARIES[this.getBinaryKey()];
    if (!config) return { available: false, path: null };
    const outputPath = path.join(this.binDir, 'gpu', config.outputName);
    if (existsSync(outputPath)) return { available: true, path: outputPath };
    return { available: false, path: null };
  }

  async ensureGpuBinary(): Promise<{ path: string }> {
    const status = this.isGpuBinaryAvailable();
    if (status.available && status.path) return { path: status.path };
    const config = GPU_BINARIES[this.getBinaryKey()];
    if (!config) throw new Error(`GPU not supported on ${this.getBinaryKey()}`);
    return this._downloadVariant(config, path.join(this.binDir, 'gpu'), 'dictation/gpu-binary-download');
  }

  getBinaryPath(accelerator: 'cpu' | 'gpu'): string | null {
    if (accelerator === 'gpu') {
      const status = this.isGpuBinaryAvailable();
      return status.path;
    }
    return this.getOutputPath();
  }

  private async _downloadVariant(
    config: BinaryConfig,
    targetDir: string,
    notifyPrefix: string,
  ): Promise<{ path: string }> {
    const key = this.getBinaryKey();
    const archivePath = path.join(targetDir, config.archiveName);
    const extractDir = path.join(targetDir, `temp-sherpa-${key}`);

    try {
      const url = `${GITHUB_RELEASE_URL}/${config.archiveName}`;
      await this.downloadFile(url, archivePath, notifyPrefix);

      await fs.mkdir(extractDir, { recursive: true });
      await extractTarBz2(archivePath, extractDir);

      const binaryPath = await this.findFileInDir(extractDir, config.binaryName);
      if (!binaryPath) throw new Error(`Binary ${config.binaryName} not found in archive`);

      const outputPath = path.join(targetDir, config.outputName);
      await fs.copyFile(binaryPath, outputPath);
      if (process.platform !== 'win32') {
        await fs.chmod(outputPath, 0o755);
      }

      await this.copyLibraries(extractDir, config.libPattern, targetDir);

      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });

      this.notify(`${notifyPrefix}-complete`, { path: outputPath });
      return { path: outputPath };
    } catch (err: any) {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(archivePath, { force: true }).catch(() => {});
      this.notify(`${notifyPrefix}-error`, { error: err.message });
      throw err;
    }
  }

  private async copyLibraries(extractDir: string, pattern: RegExp, targetDir?: string): Promise<void> {
    const destDir = targetDir || this.binDir;
    const libs = await this.findFilesMatching(extractDir, pattern);
    const versionedLibs = new Map<string, string>();

    for (const libPath of libs) {
      const libName = path.basename(libPath);
      const destPath = path.join(destDir, libName);
      await fs.copyFile(libPath, destPath);
      if (process.platform !== 'win32') {
        await fs.chmod(destPath, 0o755);
      }

      // Track versioned dylibs for symlinks (e.g. libFoo.1.23.2.dylib)
      const versionMatch = libName.match(/^(lib.+?)\.(\d+\.\d+\.\d+)\.(dylib|so|dll)$/);
      if (versionMatch) {
        const baseName = `${versionMatch[1]}.${versionMatch[3]}`;
        versionedLibs.set(baseName, libName);
      }
    }

    // Replace unversioned copies with symlinks on macOS/Linux
    if (process.platform !== 'win32') {
      for (const [baseName, versionedName] of versionedLibs) {
        const basePath = path.join(destDir, baseName);
        const versionedPath = path.join(destDir, versionedName);
        try {
          const stat = await fs.lstat(basePath);
          if (existsSync(versionedPath) && !stat.isSymbolicLink()) {
            await fs.unlink(basePath);
            await fs.symlink(versionedName, basePath);
          }
        } catch {}
      }
    }
  }

  private async findFileInDir(dir: string, fileName: string, depth = 0): Promise<string | null> {
    if (depth > 5) return null;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory()) {
        const found = await this.findFileInDir(fullPath, fileName, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  private async findFilesMatching(dir: string, pattern: RegExp, depth = 0): Promise<string[]> {
    if (depth > 5) return [];
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await this.findFilesMatching(fullPath, pattern, depth + 1));
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private downloadFile(url: string, destPath: string, notifyPrefix?: string): Promise<void> {
    return this.downloadWithRedirects(url, destPath, 0, notifyPrefix);
  }

  private downloadWithRedirects(url: string, destPath: string, redirectCount: number, notifyPrefix?: string): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) return Promise.reject(new Error('Too many redirects'));

    return new Promise((resolve, reject) => {
      if (!url.startsWith('https://')) {
        reject(new Error('Only HTTPS downloads are allowed'));
        return;
      }

      https.get(url, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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
          this.downloadWithRedirects(res.headers.location, destPath, redirectCount + 1, notifyPrefix)
            .then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastProgressTime = 0;

        const writeStream = createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastProgressTime >= 200) {
            lastProgressTime = now;
            const progress = {
              downloadedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
            };
            this.notify(`${notifyPrefix || 'dictation/binary-download'}-progress`, progress);
          }
        });

        res.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
