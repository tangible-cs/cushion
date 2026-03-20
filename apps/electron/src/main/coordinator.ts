import { spawn, type ChildProcess } from 'child_process';
import { createServer, connect } from 'net';
import { join } from 'path';
import { app } from 'electron';

let coordinatorProcess: ChildProcess | null = null;
let coordinatorPort: number = 3001;

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to get port')));
      }
    });
    server.on('error', reject);
  });
}

function waitForPort(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Coordinator did not start within ${timeoutMs}ms`));
        return;
      }
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        setTimeout(attempt, 200);
      });
    }
    attempt();
  });
}

function getCoordinatorEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'coordinator', 'dist', 'server.js');
  }
  return join(__dirname, '../../../coordinator/dist/server.js');
}

function getRuntime(): string {
  return app.isPackaged ? 'node' : 'bun';
}

export async function startCoordinator(): Promise<void> {
  coordinatorPort = await findFreePort();
  const entry = getCoordinatorEntry();
  const runtime = getRuntime();

  const args = app.isPackaged ? [entry] : ['run', entry];

  coordinatorProcess = spawn(runtime, args, {
    env: {
      ...process.env,
      COORDINATOR_PORT: String(coordinatorPort),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  coordinatorProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[coordinator] ${data.toString().trim()}`);
  });

  coordinatorProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[coordinator] ${data.toString().trim()}`);
  });

  coordinatorProcess.on('exit', (code) => {
    console.log(`[coordinator] exited with code ${code}`);
    coordinatorProcess = null;
  });

  await waitForPort(coordinatorPort);
}

export function stopCoordinator(): void {
  if (coordinatorProcess) {
    coordinatorProcess.kill();
    coordinatorProcess = null;
  }
}

export function getCoordinatorPort(): number {
  return coordinatorPort;
}
