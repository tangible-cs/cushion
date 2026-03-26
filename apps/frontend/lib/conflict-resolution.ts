import type { CoordinatorClient } from './coordinator-client';

/**
 * Resolve a filename conflict by appending " (2)", " (3)", etc.
 * "file.md" + ["file.md"] → "file (2).md"
 * "file.md" + ["file.md", "file (2).md"] → "file (3).md"
 * "file (2).md" + ["file.md", "file (2).md"] → "file (3).md"
 * "folder" + ["folder"] → "folder (2)"
 */
export function resolveConflictPath(desiredName: string, existingSiblingNames: string[]): string {
  const nameSet = new Set(existingSiblingNames.map((n) => n.toLowerCase()));

  if (!nameSet.has(desiredName.toLowerCase())) return desiredName;

  // Split into base + ext
  const dotIdx = desiredName.lastIndexOf('.');
  const hasExt = dotIdx > 0;
  const rawBase = hasExt ? desiredName.slice(0, dotIdx) : desiredName;
  const ext = hasExt ? desiredName.slice(dotIdx) : '';

  // Strip existing " (N)" suffix so duplicating "file (2)" resolves to "file (3)", not "file (2) (2)"
  const base = rawBase.replace(/ \(\d+\)$/, '');

  let n = 2;
  while (true) {
    const candidate = `${base} (${n})${ext}`;
    if (!nameSet.has(candidate.toLowerCase())) return candidate;
    n++;
  }
}

/**
 * Resolve conflict for a full path by fetching siblings from the coordinator.
 */
export async function resolveConflict(
  client: CoordinatorClient,
  desiredPath: string
): Promise<string> {
  const slashIdx = desiredPath.lastIndexOf('/');
  const parentDir = slashIdx > 0 ? desiredPath.slice(0, slashIdx) : '.';
  const desiredName = slashIdx >= 0 ? desiredPath.slice(slashIdx + 1) : desiredPath;

  const { files } = await client.listFiles(parentDir);
  const siblingNames = files.map((f) => f.name);

  const resolvedName = resolveConflictPath(desiredName, siblingNames);
  if (resolvedName === desiredName) return desiredPath;

  return slashIdx > 0 ? `${parentDir}/${resolvedName}` : resolvedName;
}

/**
 * Batch-resolve conflicts: resolves names sequentially so earlier resolutions
 * are visible to later conflict checks.
 */
export async function resolveConflicts(
  client: CoordinatorClient,
  desiredPaths: string[]
): Promise<string[]> {
  // Group by parent dir
  const byParent = new Map<string, { idx: number; name: string }[]>();
  for (let i = 0; i < desiredPaths.length; i++) {
    const p = desiredPaths[i];
    const slashIdx = p.lastIndexOf('/');
    const parentDir = slashIdx > 0 ? p.slice(0, slashIdx) : '.';
    const name = slashIdx >= 0 ? p.slice(slashIdx + 1) : p;
    if (!byParent.has(parentDir)) byParent.set(parentDir, []);
    byParent.get(parentDir)!.push({ idx: i, name });
  }

  const results = [...desiredPaths];

  for (const [parentDir, entries] of byParent) {
    const { files } = await client.listFiles(parentDir);
    const existingNames = files.map((f) => f.name);

    for (const entry of entries) {
      const resolved = resolveConflictPath(entry.name, existingNames);
      existingNames.push(resolved); // make visible to subsequent entries
      results[entry.idx] = parentDir === '.' ? resolved : `${parentDir}/${resolved}`;
    }
  }

  return results;
}
