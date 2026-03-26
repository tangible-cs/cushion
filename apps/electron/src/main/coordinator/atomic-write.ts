import fs from 'fs/promises';
import writeFileAtomic from 'write-file-atomic';

const RETRY_DELAYS_MS = [40, 120, 250, 500, 1000];

function isTransientError(error: unknown): error is NodeJS.ErrnoException {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const nodeError = error as NodeJS.ErrnoException;
  return (
    nodeError.code === 'EPERM' ||
    nodeError.code === 'EBUSY' ||
    (nodeError.code === 'EACCES' && nodeError.syscall === 'rename')
  );
}

async function cleanupTempPath(
  fullPath: string,
  error: NodeJS.ErrnoException
): Promise<void> {
  if (!error.path || typeof error.path !== 'string') {
    return;
  }
  if (!error.path.startsWith(`${fullPath}.`)) {
    return;
  }
  await fs.rm(error.path, { force: true }).catch(() => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function writeFileAtomicWithRetry(
  fullPath: string,
  content: string,
  encoding: BufferEncoding
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFileAtomic(fullPath, content, { encoding });
      return;
    } catch (error) {
      if (!isTransientError(error)) {
        throw error;
      }

      await cleanupTempPath(fullPath, error);

      if (attempt >= RETRY_DELAYS_MS.length) {
        if (process.platform === 'win32') {
          await fs.writeFile(fullPath, content, { encoding });
          return;
        }
        throw error;
      }

      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function throwSaveFileError(error: unknown, relativePath: string): never {
  const nodeError = error as NodeJS.ErrnoException;

  if (nodeError?.code === 'EACCES') {
    throw new Error(`Permission denied: ${relativePath}`);
  }
  if (nodeError?.code === 'EPERM' || nodeError?.code === 'EBUSY') {
    throw new Error(
      `File is temporarily locked by another process (for example OneDrive/antivirus): ${relativePath}`
    );
  }
  if (nodeError?.code === 'ENOSPC') {
    throw new Error('Disk full');
  }
  if (error instanceof Error) {
    throw error;
  }
  throw new Error('Unknown save error');
}
