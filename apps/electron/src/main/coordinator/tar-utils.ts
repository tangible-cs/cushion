import { spawn } from 'child_process';
import path from 'path';

/**
 * Extract a .tar.bz2 archive using system tar.
 * Windows 10+ ships bsdtar which handles bz2 natively.
 * Uses relative paths from archive dir as cwd to avoid Windows drive-letter colon issues.
 */
export function extractTarBz2(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cwd = path.dirname(archivePath);
    const relArchive = path.basename(archivePath);
    const relDest = path.relative(cwd, destDir);

    const proc = spawn('tar', ['-xjf', relArchive, '-C', relDest], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      cwd,
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`tar extraction failed (code ${code}): ${stderr.slice(0, 300)}`));
      else resolve();
    });
    proc.on('error', (err) => reject(new Error(`Failed to start tar: ${err.message}`)));
  });
}
