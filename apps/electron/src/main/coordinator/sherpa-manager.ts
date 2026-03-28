import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import { existsSync, mkdirSync, accessSync, constants as fsConstants, chmodSync } from 'fs';
import path from 'path';
import net from 'net';
import os from 'os';
import crypto from 'crypto';
import { app } from 'electron';
import type { DictationModelName, DictationServerStatus, DictationServerInfo, TranscriptionResult } from '@cushion/types';
import { SHERPA_MODEL_CATALOG, buildSherpaCliArgs } from './sherpa-model-catalog';
import WebSocket from 'ws';

const PORT_RANGE_START = 8200;
const PORT_RANGE_END = 8229;
const STARTUP_TIMEOUT_MS = 60000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const TRANSCRIPTION_TIMEOUT_MS = 300000;

type NotifyFn = (channel: string, data: unknown) => void;

export class SherpaManager {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private ready = false;
  private status: DictationServerStatus = 'stopped';
  private modelName: DictationModelName | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private startupPromise: Promise<void> | null = null;
  private transcribing = false;
  private cachedFFmpegPath: string | null = null;
  private notify: NotifyFn;
  private binDir: string;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.binDir = path.join(app.getPath('userData'), 'bin', 'sherpa');
  }

  async init(): Promise<void> {
    this.resolveFFmpegPath();
  }

  async start(modelName: DictationModelName, modelDir: string, language?: string): Promise<void> {
    if (this.startupPromise) return this.startupPromise;
    if (this.ready && this.modelName === modelName) return;
    if (this.process) await this.stop();

    this.modelName = modelName;
    this.startupPromise = this._doStart(modelName, modelDir, language);
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();

    if (!this.process) {
      this.ready = false;
      this.setStatus('stopped');
      return;
    }

    try {
      this.killProcess(this.process, 'SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) this.killProcess(this.process, 'SIGKILL');
          resolve();
        }, 5000);
        if (this.process) {
          this.process.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch {}

    this.process = null;
    this.ready = false;
    this.port = null;
    this.modelName = null;
    this.setStatus('stopped');
  }

  async transcribe(audioBuffer: Buffer): Promise<TranscriptionResult> {
    if (!this.ready || !this.process) {
      throw new Error('sherpa-onnx server is not running');
    }

    if (!this.cachedFFmpegPath) {
      throw new Error('FFmpeg not found — required for audio conversion');
    }

    // Convert webm to 16kHz mono WAV (int16)
    const wavBuffer = await this.convertToWav(audioBuffer);

    // Parse WAV to float32 samples
    const { samples, sampleRate } = this.wavToFloat32(wavBuffer);

    // Send via WebSocket
    return this.wsTranscribe(samples, sampleRate);
  }

  getStatus(): DictationServerInfo {
    return {
      status: this.status,
      port: this.port,
      modelName: this.modelName,
    };
  }


  dispose(): void {
    this.stop().catch(() => {});
  }

  private setStatus(status: DictationServerStatus): void {
    this.status = status;
    this.notify('dictation/server-status-changed', this.getStatus());
  }

  private async _doStart(modelName: DictationModelName, modelDir: string, language?: string): Promise<void> {
    this.setStatus('starting');

    const wsBinary = this.getWsBinaryPath();
    if (!wsBinary) throw new Error('sherpa-onnx WS server binary not found');
    if (!existsSync(modelDir)) throw new Error(`Model directory not found: ${modelDir}`);

    const entry = SHERPA_MODEL_CATALOG[modelName];
    if (!entry) throw new Error(`Unknown model: ${modelName}`);

    this.port = await this.findAvailablePort();
    const numThreads = Math.max(1, Math.min(4, Math.floor(os.cpus().length * 0.75)));
    const args = buildSherpaCliArgs(modelDir, this.port, numThreads, entry, language);

    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    const pathSep = process.platform === 'win32' ? ';' : ':';
    spawnEnv.PATH = this.binDir + pathSep + (process.env.PATH || '');

    if (process.platform === 'win32') {
      const safeTmp = this.getSafeTempDir();
      spawnEnv.TEMP = safeTmp;
      spawnEnv.TMP = safeTmp;
    }

    this.process = spawn(wsBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: spawnEnv,
      cwd: this.binDir,
    });

    let stderrBuffer = '';
    let exitCode: number | null = null;
    let readyResolve: ((value: boolean) => void) | null = null;
    const readyFromStderr = new Promise<boolean>((resolve) => {
      readyResolve = resolve;
    });

    this.process.stdout?.on('data', () => {});
    this.process.stderr?.on('data', (data) => {
      stderrBuffer += data.toString();
      if (data.toString().includes('Listening on:')) {
        readyResolve?.(true);
      }
    });

    this.process.on('error', () => {
      this.ready = false;
      readyResolve?.(false);
    });

    this.process.on('close', (code) => {
      exitCode = code;
      this.ready = false;
      this.process = null;
      this.stopHealthCheck();
      if (this.status === 'running') this.setStatus('error');
      readyResolve?.(false);
    });

    try {
      await this.waitForReady(readyFromStderr, () => ({ stderr: stderrBuffer, exitCode }));
    } catch (err) {
      this.setStatus('error');
      throw err;
    }

    this.startHealthCheck();
    this.setStatus('running');

    // Warm up with silent audio
    this.warmUp().catch(() => {});
  }

  private async warmUp(): Promise<void> {
    try {
      const sampleRate = 16000;
      const numSamples = sampleRate; // 1 second of silence
      const silentSamples = Buffer.alloc(numSamples * 4); // float32
      await this.wsTranscribe(silentSamples, sampleRate);
    } catch {}
  }

  private async waitForReady(
    readySignal: Promise<boolean>,
    getInfo: () => { stderr: string; exitCode: number | null },
  ): Promise<void> {
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error(`sherpa-onnx failed to start within ${STARTUP_TIMEOUT_MS}ms`)), STARTUP_TIMEOUT_MS);
    });

    const ready = await Promise.race([readySignal, timeoutPromise]);

    if (!ready) {
      const info = getInfo();
      const detail = info.stderr?.trim().slice(0, 200) || (info.exitCode !== null ? `exit code: ${info.exitCode}` : '');
      throw new Error(`sherpa-onnx process died during startup${detail ? `: ${detail}` : ''}`);
    }

    this.ready = true;
  }

  private wsTranscribe(samplesBuffer: Buffer, sampleRate: number): Promise<TranscriptionResult> {
    if (!this.ready || !this.process) {
      throw new Error('sherpa-onnx server is not running');
    }

    this.transcribing = true;

    return new Promise((resolve, reject) => {
      const done = <T>(fn: (...args: T[]) => void) => (...args: T[]) => {
        this.transcribing = false;
        fn(...args);
      };

      const timeout = setTimeout(() => {
        try { ws.close(); } catch {}
        done(reject)(new Error('sherpa-onnx transcription timed out') as any);
      }, TRANSCRIPTION_TIMEOUT_MS);

      const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      let result = '';

      ws.on('open', () => {
        // sherpa-onnx offline WS binary protocol:
        // [int32LE sample_rate][int32LE num_audio_bytes][float32 samples...]
        const message = Buffer.alloc(8 + samplesBuffer.length);
        message.writeInt32LE(sampleRate, 0);
        message.writeInt32LE(samplesBuffer.length, 4);
        samplesBuffer.copy(message, 8);
        ws.send(message);
      });

      ws.on('message', (data) => {
        result += data.toString();
        ws.send('Done');
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        let text = result.trim();
        try {
          const parsed = JSON.parse(result);
          text = (parsed.text || '').trim();
        } catch {}
        done(resolve)({ text, language: 'auto' } as any);
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        done(reject)(new Error(`sherpa-onnx transcription failed: ${error.message}`) as any);
      });
    });
  }

  /** Parse a 16-bit PCM WAV buffer into float32 samples */
  private wavToFloat32(wavBuffer: Buffer): { samples: Buffer; sampleRate: number } {
    // WAV header: bytes 24-27 = sample rate, bytes 34-35 = bits per sample
    // Data chunk starts after header (typically byte 44)
    let dataOffset = 44;
    const sampleRate = wavBuffer.readUInt32LE(24);

    // Find the 'data' chunk for robustness
    for (let i = 12; i < wavBuffer.length - 8; i++) {
      if (wavBuffer.toString('ascii', i, i + 4) === 'data') {
        dataOffset = i + 8;
        break;
      }
    }

    const numInt16Samples = (wavBuffer.length - dataOffset) / 2;
    const float32Buffer = Buffer.alloc(numInt16Samples * 4);

    for (let i = 0; i < numInt16Samples; i++) {
      const int16Val = wavBuffer.readInt16LE(dataOffset + i * 2);
      float32Buffer.writeFloatLE(int16Val / 32768.0, i * 4);
    }

    return { samples: float32Buffer, sampleRate };
  }

  private async findAvailablePort(): Promise<number> {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (await this.isPortAvailable(port)) return port;
    }
    throw new Error(`No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(() => {
      if (!this.process) {
        this.stopHealthCheck();
        return;
      }
      if (this.transcribing) return;

      if (!this.isProcessAlive()) {
        this.ready = false;
        this.setStatus('error');
        this.stopHealthCheck();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private isProcessAlive(): boolean {
    if (!this.process || this.process.killed) return false;
    try {
      process.kill(this.process.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private getWsBinaryPath(): string | null {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const platformArch = `${process.platform}-${process.arch}`;
    const binaryName = `sherpa-onnx-ws-${platformArch}${ext}`;
    const binaryPath = path.join(this.binDir, binaryName);
    if (existsSync(binaryPath)) return binaryPath;
    return null;
  }

  private async convertToWav(audioBuffer: Buffer): Promise<Buffer> {
    const tempDir = this.getSafeTempDir();
    const id = crypto.randomUUID();
    const inputPath = path.join(tempDir, `sherpa-input-${id}.webm`);
    const outputPath = path.join(tempDir, `sherpa-output-${id}.wav`);

    try {
      await fs.writeFile(inputPath, audioBuffer);
      await this.runFFmpeg(inputPath, outputPath);
      return await fs.readFile(outputPath);
    } finally {
      for (const f of [inputPath, outputPath]) {
        try { if (existsSync(f)) await fs.unlink(f); } catch {}
      }
    }
  }

  private runFFmpeg(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.cachedFFmpegPath) {
        reject(new Error('FFmpeg not found'));
        return;
      }

      const proc = spawn(this.cachedFFmpegPath, [
        '-i', inputPath,
        '-ar', '16000',
        '-ac', '1',
        '-c:a', 'pcm_s16le',
        '-y', outputPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-300)}`));
          return;
        }
        if (!existsSync(outputPath)) {
          reject(new Error('FFmpeg produced no output'));
          return;
        }
        resolve();
      });
    });
  }

  private resolveFFmpegPath(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      let ffmpegPath: string = require('ffmpeg-static');
      ffmpegPath = path.normalize(ffmpegPath);

      if (process.platform === 'win32' && !ffmpegPath.endsWith('.exe')) {
        ffmpegPath += '.exe';
      }

      const unpackedPath = ffmpegPath.includes('app.asar')
        ? ffmpegPath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
        : null;

      if (unpackedPath && existsSync(unpackedPath)) {
        if (process.platform !== 'win32') {
          try { accessSync(unpackedPath, fsConstants.X_OK); }
          catch { try { chmodSync(unpackedPath, 0o755); } catch {} }
        }
        this.cachedFFmpegPath = unpackedPath;
        return;
      }

      if (existsSync(ffmpegPath)) {
        if (process.platform !== 'win32') {
          try { accessSync(ffmpegPath, fsConstants.X_OK); }
          catch { throw new Error('Not executable'); }
        }
        this.cachedFFmpegPath = ffmpegPath;
        return;
      }
    } catch {}

    const candidates = process.platform === 'darwin'
      ? ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
      : process.platform === 'win32'
        ? ['C:\\ffmpeg\\bin\\ffmpeg.exe']
        : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];

    for (const c of candidates) {
      if (existsSync(c)) { this.cachedFFmpegPath = c; return; }
    }

    const pathEnv = process.env.PATH || '';
    const sep = process.platform === 'win32' ? ';' : ':';
    const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

    for (const dir of pathEnv.split(sep)) {
      if (!dir) continue;
      const candidate = path.join(dir.replace(/^"|"$/g, ''), bin);
      if (!existsSync(candidate)) continue;
      if (process.platform !== 'win32') {
        try { accessSync(candidate, fsConstants.X_OK); } catch { continue; }
      }
      this.cachedFFmpegPath = candidate;
      return;
    }
  }

  private getSafeTempDir(): string {
    const systemTemp = os.tmpdir();
    if (process.platform !== 'win32' || /^[\x21-\x7E]*$/.test(systemTemp)) {
      return systemTemp;
    }
    const fallbackBase = process.env.ProgramData || 'C:\\ProgramData';
    const fallback = path.join(fallbackBase, 'Cushion', 'temp');
    try {
      mkdirSync(fallback, { recursive: true });
      return fallback;
    } catch {
      return systemTemp;
    }
  }

  private killProcess(proc: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
    if (!proc || proc.exitCode !== null) return;
    try {
      if (process.platform === 'win32') {
        if (signal === 'SIGKILL') {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
            stdio: 'ignore',
            windowsHide: true,
          }).on('error', () => {});
        } else {
          proc.kill();
        }
      } else {
        proc.kill(signal);
      }
    } catch {}
  }
}
