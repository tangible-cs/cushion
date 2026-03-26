import type { FileTreeNode } from '@cushion/types';

export interface FlatTreeItem {
  kind: 'item';
  path: string;
  name: string;
  type: 'file' | 'directory';
  depth: number;
  node: FileTreeNode;
}

export interface FlatCreationItem {
  kind: 'create-file' | 'create-folder';
  parentPath: string;
  depth: number;
}

export type FlatRow = FlatTreeItem | FlatCreationItem;

export function flattenVisibleTree(
  rootNodes: FileTreeNode[],
  expandedDirs: Set<string>,
  dirContents: Map<string, FileTreeNode[]>,
  showCushionFiles: boolean,
  creatingFileInDir: string | null,
  creatingFolderInDir: string | null,
): FlatRow[] {
  const result: FlatRow[] = [];

  // Root-level creation rows
  if (creatingFileInDir === '__root__') {
    result.push({ kind: 'create-file', parentPath: '__root__', depth: 0 });
  }
  if (creatingFolderInDir === '__root__') {
    result.push({ kind: 'create-folder', parentPath: '__root__', depth: 0 });
  }

  const walk = (items: FileTreeNode[], depth: number) => {
    const filtered = showCushionFiles ? items : items.filter((n) => n.name !== '.cushion');
    for (const node of filtered) {
      result.push({
        kind: 'item',
        path: node.path,
        name: node.name,
        type: node.type,
        depth,
        node,
      });

      if (node.type === 'directory' && expandedDirs.has(node.path)) {
        const children = dirContents.get(node.path);
        if (children) {
          walk(children, depth + 1);
        }

        // Creation rows inside this directory
        if (creatingFileInDir === node.path) {
          result.push({ kind: 'create-file', parentPath: node.path, depth: depth + 1 });
        }
        if (creatingFolderInDir === node.path) {
          result.push({ kind: 'create-folder', parentPath: node.path, depth: depth + 1 });
        }
      }
    }
  };

  walk(rootNodes, 0);
  return result;
}

export function flatPathsFromRows(rows: FlatRow[]): string[] {
  const paths: string[] = [];
  for (const row of rows) {
    if (row.kind === 'item') paths.push(row.path);
  }
  return paths;
}
