import { spawn, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import net from 'node:net';
import path from 'node:path';

const OPENCODE_PORT = 14_097;
const CORS_ORIGIN = 'http://localhost:3000';

let serverProcess: ChildProcess | null = null;

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.connect(port, '127.0.0.1');
  });
}

function getOpenCodeBin(): string {
  const base = app.isPackaged
    ? __dirname.replace('app.asar', 'app.asar.unpacked')
    : __dirname;
  const modulesDir = path.join(base, '../../node_modules');

  const platformMap: Record<string, string> = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
  const platform = platformMap[process.platform] || process.platform;
  const arch = process.arch;
  const binary = platform === 'windows' ? 'opencode.exe' : 'opencode';

  const candidates = [
    `opencode-${platform}-${arch}-baseline`,
    `opencode-${platform}-${arch}`,
  ];

  for (const name of candidates) {
    const candidate = path.join(modulesDir, name, 'bin', binary);
    try { require('fs').accessSync(candidate); return candidate; } catch {}
  }

  return path.join(modulesDir, '.bin', binary);
}

export async function startOpenCodeServer(): Promise<void> {
  if (await isPortListening(OPENCODE_PORT)) {
    console.log(`[OpenCode] Already listening on port ${OPENCODE_PORT}, reusing existing server.`);
    return;
  }

  console.log(`[OpenCode] Starting server on port ${OPENCODE_PORT}...`);

  serverProcess = spawn(getOpenCodeBin(), ['serve', '--port', String(OPENCODE_PORT), '--cors', CORS_ORIGIN], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout?.on('data', (d: Buffer) => console.log(`[OpenCode] ${d.toString().trimEnd()}`));
  serverProcess.stderr?.on('data', (d: Buffer) => console.error(`[OpenCode] ${d.toString().trimEnd()}`));
  serverProcess.on('error', (err) => { console.error('[OpenCode] Failed to start:', err.message); serverProcess = null; });
  serverProcess.on('close', (code) => { console.log(`[OpenCode] Server exited with code ${code}`); serverProcess = null; });
}

export function stopOpenCodeServer(): void {
  if (!serverProcess) return;
  console.log('[OpenCode] Stopping server...');
  serverProcess.kill();
  serverProcess = null;
}
