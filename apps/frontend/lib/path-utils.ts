/**
 * Shared path utilities for extracting parts of file paths.
 * Normalizes backslashes to forward slashes for cross-platform support.
 */

export function getDirectory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
}

export function getFilename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

export function getBaseName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}
