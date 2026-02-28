import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { WorkspaceManager } from './manager';

let manager: WorkspaceManager;
let tmpDir: string;

beforeEach(async () => {
  manager = new WorkspaceManager();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cushion-test-'));
  await manager.openWorkspace(tmpDir);
});

afterEach(async () => {
  await manager.closeWorkspace();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Path traversal payloads — every file mutation/read method must reject these
// ---------------------------------------------------------------------------

const TRAVERSAL_PAYLOADS = [
  '../etc/passwd',
  '../../etc/passwd',
  'subdir/../../etc/passwd',
  'subdir/../../../etc/passwd',
  '..\\etc\\passwd',
  '..\\..\\etc\\passwd',
  'subdir\\..\\..\\etc\\passwd',
];

describe('path traversal rejection', () => {
  describe('readFile', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.readFile(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('saveFile', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.saveFile(payload, 'evil')).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('deleteFile', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.deleteFile(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('renameFile', () => {
    test('rejects traversal in source path', async () => {
      await expect(
        manager.renameFile('../evil.md', 'safe.md')
      ).rejects.toThrow('Path outside workspace');
    });

    test('rejects traversal in destination path', async () => {
      // Create a real source file so the error comes from dest validation
      await fs.writeFile(path.join(tmpDir, 'safe.md'), 'ok');
      await expect(
        manager.renameFile('safe.md', '../evil.md')
      ).rejects.toThrow('Path outside workspace');
    });
  });

  describe('duplicateFile', () => {
    test('rejects traversal in source path', async () => {
      await expect(
        manager.duplicateFile('../evil.md', 'copy.md')
      ).rejects.toThrow('Path outside workspace');
    });

    test('rejects traversal in destination path', async () => {
      await fs.writeFile(path.join(tmpDir, 'safe.md'), 'ok');
      await expect(
        manager.duplicateFile('safe.md', '../evil-copy.md')
      ).rejects.toThrow('Path outside workspace');
    });
  });

  describe('createFolder', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.createFolder(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('listFiles', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.listFiles(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('fileExists', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.fileExists(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('readFileBase64', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(manager.readFileBase64(payload)).rejects.toThrow(
          'Path outside workspace'
        );
      });
    }
  });

  describe('saveFileBase64', () => {
    for (const payload of TRAVERSAL_PAYLOADS) {
      test(`rejects "${payload}"`, async () => {
        await expect(
          manager.saveFileBase64(payload, Buffer.from('evil').toString('base64'))
        ).rejects.toThrow('Path outside workspace');
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Sibling-prefix bypass: workspace "/tmp/foo" must reject "/tmp/foo-evil"
// ---------------------------------------------------------------------------

describe('sibling-prefix bypass', () => {
  let siblingDir: string;

  beforeEach(async () => {
    // Create a sibling directory whose name starts with the workspace dir name
    siblingDir = tmpDir + '-evil';
    await fs.mkdir(siblingDir, { recursive: true });
    await fs.writeFile(path.join(siblingDir, 'secret.txt'), 'stolen');
  });

  afterEach(async () => {
    await fs.rm(siblingDir, { recursive: true, force: true });
  });

  // Build a relative path that after join+resolve lands in the sibling dir.
  // e.g. workspace = /tmp/cushion-test-abc → sibling = /tmp/cushion-test-abc-evil
  // relative path: "../cushion-test-abc-evil/secret.txt"
  function siblingRelative(filename: string): string {
    const workspaceName = path.basename(tmpDir);
    return `../${workspaceName}-evil/${filename}`;
  }

  test('readFile rejects sibling-prefix path', async () => {
    await expect(manager.readFile(siblingRelative('secret.txt'))).rejects.toThrow(
      'Path outside workspace'
    );
  });

  test('saveFile rejects sibling-prefix path', async () => {
    await expect(
      manager.saveFile(siblingRelative('injected.txt'), 'evil')
    ).rejects.toThrow('Path outside workspace');
  });

  test('deleteFile rejects sibling-prefix path', async () => {
    await expect(
      manager.deleteFile(siblingRelative('secret.txt'))
    ).rejects.toThrow('Path outside workspace');
  });

  test('listFiles rejects sibling-prefix path', async () => {
    await expect(manager.listFiles(siblingRelative('.'))).rejects.toThrow(
      'Path outside workspace'
    );
  });
});

// ---------------------------------------------------------------------------
// Valid paths — make sure legitimate operations still work
// ---------------------------------------------------------------------------

describe('valid workspace operations', () => {
  test('readFile works for files inside workspace', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.md'), '# Hello');
    const result = await manager.readFile('hello.md');
    expect(result.content).toBe('# Hello');
  });

  test('saveFile creates and writes files inside workspace', async () => {
    await manager.saveFile('new-file.md', '# New');
    const content = await fs.readFile(path.join(tmpDir, 'new-file.md'), 'utf-8');
    expect(content).toBe('# New');
  });

  test('saveFile creates nested directories', async () => {
    await manager.saveFile('sub/dir/deep.md', 'deep');
    const content = await fs.readFile(
      path.join(tmpDir, 'sub', 'dir', 'deep.md'),
      'utf-8'
    );
    expect(content).toBe('deep');
  });

  test('createFolder creates directory inside workspace', async () => {
    await manager.createFolder('new-folder');
    const stat = await fs.stat(path.join(tmpDir, 'new-folder'));
    expect(stat.isDirectory()).toBe(true);
  });

  test('listFiles returns entries inside workspace', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), 'a');
    await fs.mkdir(path.join(tmpDir, 'subdir'));
    const nodes = await manager.listFiles('.');
    const names = nodes.map((n) => n.name);
    expect(names).toContain('a.md');
    expect(names).toContain('subdir');
  });

  test('fileExists returns true for existing file', async () => {
    await fs.writeFile(path.join(tmpDir, 'exists.md'), 'yes');
    expect(await manager.fileExists('exists.md')).toBe(true);
  });

  test('fileExists returns false for missing file', async () => {
    expect(await manager.fileExists('nope.md')).toBe(false);
  });

  test('renameFile works inside workspace', async () => {
    await fs.writeFile(path.join(tmpDir, 'old.md'), 'content');
    await manager.renameFile('old.md', 'new.md');
    expect(await manager.fileExists('new.md')).toBe(true);
    expect(await manager.fileExists('old.md')).toBe(false);
  });

  test('deleteFile removes file inside workspace', async () => {
    await fs.writeFile(path.join(tmpDir, 'doomed.md'), 'bye');
    await manager.deleteFile('doomed.md');
    expect(await manager.fileExists('doomed.md')).toBe(false);
  });

  test('duplicateFile copies file inside workspace', async () => {
    await fs.writeFile(path.join(tmpDir, 'orig.md'), 'original');
    await manager.duplicateFile('orig.md', 'copy.md');
    const result = await manager.readFile('copy.md');
    expect(result.content).toBe('original');
  });

  test('readFileBase64 works for binary files', async () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    await fs.writeFile(path.join(tmpDir, 'img.png'), data);
    const result = await manager.readFileBase64('img.png');
    expect(result.base64).toBe(data.toString('base64'));
    expect(result.mimeType).toBe('image/png');
  });

  test('saveFileBase64 writes binary files', async () => {
    const data = Buffer.from([0x25, 0x50, 0x44, 0x46]); // PDF header bytes
    await manager.saveFileBase64('doc.pdf', data.toString('base64'));
    const written = await fs.readFile(path.join(tmpDir, 'doc.pdf'));
    expect(Buffer.compare(written, data)).toBe(0);
  });
});
