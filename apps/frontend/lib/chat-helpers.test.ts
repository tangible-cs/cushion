import { describe, expect, it } from 'vitest';
import { buildFileUrl, encodeFilePath, resolveAbsolutePath } from './chat-helpers';

describe('chat path helpers', () => {
  it('resolves relative paths against directory with slash normalization', () => {
    expect(resolveAbsolutePath('C:\\repo\\project\\', 'src\\main.ts')).toBe('C:/repo/project/src/main.ts');
  });

  it('preserves absolute UNC paths', () => {
    expect(resolveAbsolutePath('C:/repo/project', '\\\\server\\share\\notes\\a b.md')).toBe('//server/share/notes/a b.md');
  });

  it('encodes file paths by segment while preserving drive letters', () => {
    expect(encodeFilePath('C:/Users/me/My File #1.md')).toBe('/C:/Users/me/My%20File%20%231.md');
  });

  it('builds encoded file urls for workspace-relative files', () => {
    expect(buildFileUrl('/workspace', 'docs/My File #1?.md')).toBe('file:///workspace/docs/My%20File%20%231%3F.md');
  });

  it('builds encoded file urls for windows absolute files', () => {
    expect(buildFileUrl('C:/workspace', 'C:\\Users\\me\\notes\\My File.md')).toBe('file:///C:/Users/me/notes/My%20File.md');
  });

  it('adds line selection query params after encoding the path', () => {
    expect(
      buildFileUrl('/workspace', 'docs/niño 🧪.md', {
        startLine: 8,
        startChar: 0,
        endLine: 3,
        endChar: 0,
      })
    ).toBe('file:///workspace/docs/ni%C3%B1o%20%F0%9F%A7%AA.md?start=3&end=8');
  });
});
