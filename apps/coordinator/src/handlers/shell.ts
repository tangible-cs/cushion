import { spawn, type ChildProcess } from 'node:child_process';

const ALLOWED_COMMANDS = new Set(['pip', 'pip3', 'python', 'python3', 'py', 'playwright', 'notebooklm']);
const SHELL_META = /[;|&$`\\<>(){}!"'\n\r]/;

// 10 MB max buffer per stream
const MAX_BUFFER = 10 * 1024 * 1024;

let loginProcess: ChildProcess | null = null;

export async function handleShellExec(
  params: { command: string; args: string[] },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { command, args } = params;

  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  for (const arg of args) {
    if (SHELL_META.test(arg)) {
      throw new Error(`Argument contains disallowed characters: ${arg}`);
    }
  }

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: true,
      timeout: 300_000,
      env: { ...process.env, PYTHONUTF8: '1' },
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > MAX_BUFFER) { killed = true; child.kill(); }
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > MAX_BUFFER) { killed = true; child.kill(); }
    });

    child.on('close', (code) => {
      if (killed) stderr += '\n[killed: output exceeded 10 MB limit]';
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

export function handleLoginStart(): { started: boolean } {
  if (loginProcess) {
    loginProcess.kill();
    loginProcess = null;
  }

  loginProcess = spawn('notebooklm', ['login'], {
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUTF8: '1' },
  });

  loginProcess.on('close', () => { loginProcess = null; });
  loginProcess.on('error', () => { loginProcess = null; });

  return { started: true };
}

export function handleLoginFinish(): { finished: boolean } {
  if (!loginProcess) {
    return { finished: false };
  }

  const proc = loginProcess;
  loginProcess = null;

  proc.stdin?.write('\n');
  proc.stdin?.end();

  setTimeout(() => { proc.kill(); }, 5_000);

  return { finished: true };
}
