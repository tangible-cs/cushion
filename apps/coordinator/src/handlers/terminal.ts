import { spawn, type IPty } from '@lydell/node-pty';
import type { WebSocket } from 'ws';
import type {
  TerminalCommandParams,
  TerminalCreateParams,
  TerminalInputParams,
  TerminalResizeParams,
  TerminalOutputParams,
  JSONRPCNotification,
} from '@cushion/types';

export type TerminalSessionMap = Map<WebSocket, IPty>;

function sendNotification(ws: WebSocket, method: string, params: unknown) {
  const notification: JSONRPCNotification = {
    jsonrpc: '2.0',
    method,
    params,
  };
  ws.send(JSON.stringify(notification));
}

export async function handleTerminalCommand(
  ws: WebSocket,
  terminalProcesses: TerminalSessionMap,
  params: TerminalCommandParams
): Promise<{ success: boolean; output: string; exitCode?: number }> {
  const { command, workingDirectory } = params;

  const existingProcess = terminalProcesses.get(ws);
  if (existingProcess) {
    existingProcess.kill();
    terminalProcesses.delete(ws);
  }

  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    const term = spawn(shell, [command], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDirectory || process.cwd(),
      env: process.env,
    });

    terminalProcesses.set(ws, term);

    let output = '';

    term.onData((data) => {
      output += data;
      sendNotification(ws, 'terminal/output', {
        output: data,
        error: false,
      } as TerminalOutputParams);
    });

    term.onExit(({ exitCode }) => {
      resolve({
        success: exitCode === 0,
        output,
        exitCode,
      });

      terminalProcesses.delete(ws);
    });

    if (process.platform === 'win32') {
      term.write(command + '\r');
    }
  });
}

export async function handleTerminalCreate(
  ws: WebSocket,
  terminalSessions: TerminalSessionMap,
  params: TerminalCreateParams
): Promise<{ success: boolean; sessionId: string }> {
  const { workingDirectory, shell } = params;

  const existingSession = terminalSessions.get(ws);
  if (existingSession) {
    existingSession.kill();
    terminalSessions.delete(ws);
  }

  return new Promise((resolve) => {
    const shellName =
      shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');

    const term = spawn(shellName, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDirectory || process.cwd(),
      env: process.env,
    });

    terminalSessions.set(ws, term);

    const sessionId = `term_${Date.now()}`;

    term.onData((data) => {
      sendNotification(ws, 'terminal/output', {
        output: data,
        error: false,
      } as TerminalOutputParams);
    });

    term.onExit(({ exitCode, signal }) => {
      sendNotification(ws, 'terminal/exit', { code: exitCode, signal, sessionId });
      terminalSessions.delete(ws);
    });

    resolve({
      success: true,
      sessionId,
    });
  });
}

export async function handleTerminalInput(
  ws: WebSocket,
  terminalSessions: TerminalSessionMap,
  params: TerminalInputParams
): Promise<{ success: boolean }> {
  const { input } = params;
  const term = terminalSessions.get(ws);

  if (!term) {
    return { success: false };
  }

  try {
    term.write(input);
    return { success: true };
  } catch (error) {
    console.error('[Coordinator] Error writing to terminal:', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false };
  }
}

export async function handleTerminalResize(
  ws: WebSocket,
  terminalSessions: TerminalSessionMap,
  params: TerminalResizeParams
): Promise<{ success: boolean }> {
  const { cols, rows } = params;
  const term = terminalSessions.get(ws);

  if (!term) {
    return { success: false };
  }

  try {
    term.resize(cols, rows);
    return { success: true };
  } catch (error) {
    console.error('[Coordinator] Error resizing terminal:', error);
    return { success: false };
  }
}

export async function handleTerminalDestroy(
  ws: WebSocket,
  terminalSessions: TerminalSessionMap
): Promise<{ success: boolean }> {
  const term = terminalSessions.get(ws);

  if (!term) {
    return { success: false };
  }

  try {
    term.kill();
    terminalSessions.delete(ws);
    return { success: true };
  } catch (error) {
    console.error('[Coordinator] Error destroying terminal:', error);
    return { success: false };
  }
}

export function cleanupTerminalSessions(
  ws: WebSocket,
  terminalSessions: TerminalSessionMap,
  terminalProcesses: TerminalSessionMap
) {
  const terminalSession = terminalSessions.get(ws);
  if (terminalSession) {
    terminalSession.kill();
    terminalSessions.delete(ws);
  }

  const terminalProcess = terminalProcesses.get(ws);
  if (terminalProcess) {
    terminalProcess.kill();
    terminalProcesses.delete(ws);
  }
}
