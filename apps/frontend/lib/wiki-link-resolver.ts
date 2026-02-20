/**
 * Wiki-Link Resolution
 * 
 * Resolves wiki-link hrefs to actual file paths in the workspace.
 * Uses fuzzy matching similar to Tangent's approach:
 *   - Case-insensitive matching
 *   - Partial path matching (filename alone can match full path)
 *   - Extension inference (prefers .md files)
 */

import type { FileTreeNode, ResolvedWikiLink, WikiLinkState } from '@cushion/types';
import { getBaseName } from './path-utils';

export function flattenFileTree(nodes: FileTreeNode[], prefix: string = ''): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;

    if (node.type === 'file') {
      paths.push(fullPath);
    } else if (node.type === 'directory' && node.children) {
      paths.push(...flattenFileTree(node.children, fullPath));
    }
  }

  return paths;
}

/**
 * Get the file extension (including the dot).
 * 
 * @param filePath - Full file path
 * @returns Extension with dot, or empty string
 */
function getExtension(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(lastDot) : '';
}

/**
 * Check if a file path matches a wiki-link href.
 * 
 * Matching rules (similar to Tangent):
 *   1. Exact match (with or without extension)
 *   2. Filename-only match (href matches just the filename part)
 *   3. Case-insensitive matching
 * 
 * @param filePath - Full file path from the file tree
 * @param href - Wiki-link href to match
 * @returns true if the file matches the href
 */
function matchesHref(filePath: string, href: string): boolean {
  const filePathLower = filePath.toLowerCase();
  const hrefLower = href.toLowerCase();
  
  // Normalize path separators
  const normalizedFilePath = filePathLower.replace(/\\/g, '/');
  const normalizedHref = hrefLower.replace(/\\/g, '/');
  
  // Check 1: Exact match (with extension)
  if (normalizedFilePath === normalizedHref) {
    return true;
  }
  
  // Check 2: Exact match (href without extension matches file path)
  const fileBasePath = normalizedFilePath.replace(/\.[^.]+$/, '');
  if (fileBasePath === normalizedHref) {
    return true;
  }
  
  // Check 3: Filename-only match
  const fileBaseName = getBaseName(filePath).toLowerCase();
  const hrefBaseName = getBaseName(href).toLowerCase();
  
  if (fileBaseName === hrefBaseName) {
    return true;
  }
  
  // Check 4: Partial path match (href is a suffix of the file path)
  // e.g., "notes/todo" matches "projects/notes/todo.md"
  if (normalizedFilePath.endsWith(`/${normalizedHref}`) ||
      fileBasePath.endsWith(`/${normalizedHref}`)) {
    return true;
  }
  
  return false;
}

/**
 * Score a match for ranking (higher is better).
 * Used when multiple files match to pick the best one.
 * 
 * @param filePath - Full file path
 * @param href - Wiki-link href
 * @returns Score for ranking matches
 */
function scoreMatch(filePath: string, href: string): number {
  let score = 0;
  
  const filePathLower = filePath.toLowerCase().replace(/\\/g, '/');
  const hrefLower = href.toLowerCase().replace(/\\/g, '/');
  
  // Prefer exact matches
  if (filePathLower === hrefLower || filePathLower.replace(/\.[^.]+$/, '') === hrefLower) {
    score += 100;
  }
  
  // Prefer .md files (common for wiki-style notes)
  if (filePath.toLowerCase().endsWith('.md')) {
    score += 50;
  }
  
  // Prefer shorter paths (less nested)
  const depth = filePath.split('/').length;
  score -= depth * 2;
  
  // Prefer case-matching
  if (filePath.includes(href)) {
    score += 10;
  }
  
  return score;
}

/**
 * Resolve a wiki-link href to file path(s).
 * 
 * @param href - Wiki-link href (e.g., "My Note" or "folder/note")
 * @param fileTree - Current file tree from the workspace
 * @returns ResolvedWikiLink with state and target paths
 */
export function resolveWikiLink(href: string, fileTree: FileTreeNode[]): ResolvedWikiLink {
  const allPaths = flattenFileTree(fileTree);
  
  // Find all matching files
  const matches = allPaths.filter(path => matchesHref(path, href));
  
  if (matches.length === 0) {
    // If the href looks like a direct relative path (has directory separators
    // and a file extension), treat it as resolved even if it's not in the file
    // tree.  This supports files inside hidden folders like `.cushion/images/`.
    if (href.includes('/') && /\.[a-zA-Z0-9]+$/.test(href)) {
      return { state: 'resolved', targets: [href] };
    }
    return { state: 'empty', targets: [] };
  }
  
  if (matches.length === 1) {
    return { state: 'resolved', targets: matches };
  }
  
  // Multiple matches - sort by score and check if top match is clearly better
  const scored = matches.map(path => ({ path, score: scoreMatch(path, href) }));
  scored.sort((a, b) => b.score - a.score);
  
  // If top match is significantly better, treat as resolved
  if (scored[0].score > scored[1].score + 30) {
    return { state: 'resolved', targets: [scored[0].path] };
  }
  
  // Multiple equally good matches - ambiguous
  return { state: 'ambiguous', targets: matches };
}

/**
 * Build the path for creating a new file from a wiki-link.
 * 
 * @param href - Wiki-link href
 * @param currentFilePath - Path of the file containing the link (for relative resolution)
 * @returns Path for the new file to create
 */
export function buildNewFilePath(href: string, currentFilePath?: string): string {
  // If href already has an extension, use it
  if (href.includes('.')) {
    return href;
  }
  
  // Default to .md extension for wiki-links
  return `${href}.md`;
}

/**
 * Search files for autocomplete suggestions.
 * 
 * @param query - Partial query text
 * @param fileTree - Current file tree
 * @param maxResults - Maximum number of results
 * @returns Array of matching file paths, sorted by relevance
 */
export function searchFiles(query: string, fileTree: FileTreeNode[], maxResults: number = 10): string[] {
  const allPaths = flattenFileTree(fileTree);
  const queryLower = query.toLowerCase();
  
  // Filter to matching paths
  const matches = allPaths.filter(path => {
    const pathLower = path.toLowerCase();
    const baseName = getBaseName(path).toLowerCase();
    
    // Match if query appears anywhere in path or basename
    return pathLower.includes(queryLower) || baseName.includes(queryLower);
  });
  
  // Score and sort
  const scored = matches.map(path => {
    let score = 0;
    const pathLower = path.toLowerCase();
    const baseName = getBaseName(path).toLowerCase();
    
    // Prefer matches at start of basename
    if (baseName.startsWith(queryLower)) {
      score += 100;
    }
    
    // Prefer matches at start of path segments
    if (pathLower.includes(`/${queryLower}`)) {
      score += 50;
    }
    
    // Prefer .md files
    if (path.endsWith('.md')) {
      score += 30;
    }
    
    // Prefer shorter paths
    score -= path.split('/').length * 2;
    
    return { path, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  
  return scored.slice(0, maxResults).map(s => s.path);
}
