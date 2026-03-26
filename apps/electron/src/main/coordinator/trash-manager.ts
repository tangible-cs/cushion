import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { TrashItem } from '@cushion/types';
import { writeFileAtomicWithRetry } from './atomic-write';

interface TrashManifest {
  items: TrashItem[];
}

export class TrashManager {
  private workspacePath = '';
  private trashDir = '';
  private manifestPath = '';
  private manifest: TrashManifest = { items: [] };

  async init(workspacePath: string): Promise<void> {
    this.workspacePath = workspacePath;
    this.trashDir = path.join(workspacePath, '.cushion-trash');
    this.manifestPath = path.join(this.trashDir, 'manifest.json');

    await fs.mkdir(this.trashDir, { recursive: true });
    await this.loadManifest();
  }

  async moveToTrash(relativePath: string, isDirectory: boolean): Promise<TrashItem> {
    const id = crypto.randomUUID();
    const source = path.join(this.workspacePath, relativePath);
    const dest = path.join(this.trashDir, id);

    await fs.rename(source, dest);

    const item: TrashItem = {
      id,
      originalPath: relativePath,
      deletedAt: new Date().toISOString(),
      isDirectory,
    };

    this.manifest.items.push(item);
    await this.saveManifest();
    return item;
  }

  async restore(ids: string[]): Promise<string[]> {
    const restoredPaths: string[] = [];

    for (const id of ids) {
      const idx = this.manifest.items.findIndex((item) => item.id === id);
      if (idx === -1) continue;

      const item = this.manifest.items[idx];
      const trashPath = path.join(this.trashDir, id);

      let targetPath = path.join(this.workspacePath, item.originalPath);
      let finalRelativePath = item.originalPath;

      try {
        await fs.access(targetPath);
        finalRelativePath = this.resolveCollision(item.originalPath);
        targetPath = path.join(this.workspacePath, finalRelativePath);
      } catch {}

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.rename(trashPath, targetPath);

      this.manifest.items.splice(idx, 1);
      restoredPaths.push(finalRelativePath);
    }

    await this.saveManifest();
    return restoredPaths;
  }

  async permanentlyDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      const idx = this.manifest.items.findIndex((item) => item.id === id);
      if (idx === -1) continue;

      const trashPath = path.join(this.trashDir, id);
      await fs.rm(trashPath, { recursive: true, force: true });
      this.manifest.items.splice(idx, 1);
    }

    await this.saveManifest();
  }

  async emptyTrash(): Promise<void> {
    for (const item of this.manifest.items) {
      const trashPath = path.join(this.trashDir, item.id);
      await fs.rm(trashPath, { recursive: true, force: true });
    }

    this.manifest.items = [];
    await this.saveManifest();
  }

  listItems(): TrashItem[] {
    return this.manifest.items;
  }

  private async saveManifest(): Promise<void> {
    const json = JSON.stringify(this.manifest, null, 2);
    await writeFileAtomicWithRetry(this.manifestPath, json, 'utf-8');
  }

  private async loadManifest(): Promise<void> {
    try {
      const raw = await fs.readFile(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as TrashManifest;
      this.manifest = parsed;
    } catch {
      this.manifest = { items: [] };
    }

    const validItems: TrashItem[] = [];
    for (const item of this.manifest.items) {
      try {
        await fs.access(path.join(this.trashDir, item.id));
        validItems.push(item);
      } catch {}
    }

    if (validItems.length !== this.manifest.items.length) {
      this.manifest.items = validItems;
      await this.saveManifest();
    }
  }

  private resolveCollision(originalPath: string): string {
    const dir = path.dirname(originalPath);
    const ext = path.extname(originalPath);
    const base = path.basename(originalPath, ext);

    let suffix = ' (restored)';
    let candidate = path.join(dir, `${base}${suffix}${ext}`).replace(/\\/g, '/');

    let counter = 2;
    while (this.manifest.items.some((item) => item.originalPath === candidate)) {
      suffix = ` (restored ${counter})`;
      candidate = path.join(dir, `${base}${suffix}${ext}`).replace(/\\/g, '/');
      counter++;
    }

    return candidate;
  }
}
