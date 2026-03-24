import { spawn, type ChildProcess } from 'node:child_process';

/** Commands allowed by shell/exec — only setup-related binaries. */
const ALLOWED_COMMANDS = new Set(['pip', 'pip3', 'python', 'python3', 'py', 'playwright', 'notebooklm']);

/** Shell metacharacters that must not appear in args. */
const SHELL_META = /[;|&$`\\<>(){}!"'\n\r]/;

/** Tracks the active login process so we can send Enter to it later. */
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

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      resolve({ stdout, stderr: err.message, exitCode: 1 });
    });
  });
}

/**
 * Spawns `notebooklm login` in the background (opens browser).
 * The process stays alive waiting for Enter on stdin.
 */
export function handleLoginStart(): { started: boolean } {
  // Kill any existing login process
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

/**
 * Sends Enter to the login process stdin to finalize auth and close the browser.
 */
export function handleLoginFinish(): { finished: boolean } {
  if (!loginProcess) {
    return { finished: false };
  }

  loginProcess.stdin?.write('\n');
  loginProcess.stdin?.end();

  // Give it a moment then force-kill if still alive
  setTimeout(() => {
    if (loginProcess) {
      loginProcess.kill();
      loginProcess = null;
    }
  }, 5_000);

  return { finished: true };
}
