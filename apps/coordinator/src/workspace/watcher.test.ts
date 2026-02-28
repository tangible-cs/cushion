import { describe, expect, test } from 'bun:test';
import os from 'os';
import path from 'path';
import { createIgnoredPathMatcher } from './watcher';

describe('createIgnoredPathMatcher', () => {
  const workspacePath = path.resolve(path.join(os.tmpdir(), 'cushion-watcher-workspace'));
  const isIgnored = createIgnoredPathMatcher(workspacePath);

  test('ignores configured heavy directories', () => {
    expect(isIgnored(path.join(workspacePath, 'node_modules'))).toBe(true);
    expect(isIgnored(path.join(workspacePath, 'node_modules', 'pkg', 'index.js'))).toBe(true);
    expect(isIgnored(path.join(workspacePath, '.next', 'cache', 'manifest.json'))).toBe(true);
    expect(isIgnored(path.join(workspacePath, 'dist', 'bundle.js'))).toBe(true);
  });

  test('ignores watcher-only .cushion directory', () => {
    expect(isIgnored(path.join(workspacePath, '.cushion'))).toBe(true);
    expect(isIgnored(path.join(workspacePath, '.cushion', 'state.json'))).toBe(true);
  });

  test('does not ignore similarly named directories', () => {
    expect(isIgnored(path.join(workspacePath, 'node_modules_backup', 'index.js'))).toBe(false);
    expect(isIgnored(path.join(workspacePath, 'distilled', 'notes.md'))).toBe(false);
  });

  test('does not ignore workspace root or regular files', () => {
    expect(isIgnored(workspacePath)).toBe(false);
    expect(isIgnored(path.join(workspacePath, 'notes', 'daily.md'))).toBe(false);
  });

  test('does not ignore outside paths even if they contain ignored names', () => {
    const outsidePath = path.resolve(path.join(path.dirname(workspacePath), 'node_modules', 'outside.js'));
    expect(isIgnored(outsidePath)).toBe(false);
  });

  test('handles backslash paths consistently', () => {
    const windowsStylePath = path
      .join(workspacePath, '.next', 'chunks', 'page.js')
      .replace(/\//g, '\\');
    expect(isIgnored(windowsStylePath)).toBe(true);
  });
});
