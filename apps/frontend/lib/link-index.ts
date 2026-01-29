/**
 * Link Index
 * 
 * Tracks connections between files (wiki-links).
 * Used by both backlinks panel and graph view.
 */

import type { FileTreeNode } from '@cushion/types';
import { findAllWikiLinks } from './wiki-link';
import { flattenFileTree } from './wiki-link-resolver';

/** Information about a link from one file to another */
export interface LinkInfo {
  /** Path of the file containing the link */
  from: string;
  /** Path of the target file (resolved) */
  to: string;
  /** Original href text from the wiki-link */
  href: string;
  /** Line number where the link appears (1-based) */
  line: number;
  /** Context text around the link */
  context: string;
}

/** A node in the graph (represents a file) */
export interface GraphNode {
  /** File path (unique identifier) */
  id: string;
  /** Display name (filename without extension) */
  label: string;
  /** Whether this file exists in the workspace */
  exists: boolean;
  /** Number of outgoing links */
  outgoingCount: number;
  /** Number of incoming links (backlinks) */
  incomingCount: number;
}

/** An edge in the graph (represents a link between files) */
export interface GraphEdge {
  /** Source file path */
  source: string;
  /** Target file path */
  target: string;
}

/** The complete link index */
export interface LinkIndex {
  /** Map of file path -> outgoing links */
  outgoing: Map<string, LinkInfo[]>;
  /** Map of file path -> incoming links (backlinks) */
  incoming: Map<string, LinkInfo[]>;
  /** All nodes for graph view */
  nodes: GraphNode[];
  /** All edges for graph view */
  edges: GraphEdge[];
}

/**
 * Get filename without extension.
 */
function getBaseName(filePath: string): string {
  const name = filePath.split('/').pop() || filePath;
  const lastDot = name.lastIndexOf('.');
  return lastDot > 0 ? name.slice(0, lastDot) : name;
}

/**
 * Resolve a wiki-link href to a file path.
 * Returns the matching file path or the href with .md extension if not found.
 */
function resolveHref(href: string, allFiles: string[]): { path: string; exists: boolean } {
  const hrefLower = href.toLowerCase();
  
  // Try exact match first
  for (const file of allFiles) {
    const fileLower = file.toLowerCase();
    const fileBase = fileLower.replace(/\.md$/, '');
    
    if (fileLower === hrefLower || fileBase === hrefLower) {
      return { path: file, exists: true };
    }
  }
  
  // Try filename-only match
  for (const file of allFiles) {
    const fileBaseName = getBaseName(file).toLowerCase();
    const hrefBaseName = getBaseName(href).toLowerCase();
    
    if (fileBaseName === hrefBaseName) {
      return { path: file, exists: true };
    }
  }
  
  // Not found - return href with .md extension
  const path = href.endsWith('.md') ? href : `${href}.md`;
  return { path, exists: false };
}

/**
 * Get context around a link (the line containing the link).
 */
function getContext(content: string, start: number, end: number): { line: number; context: string } {
  const lines = content.split('\n');
  let charCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length + 1; // +1 for newline
    if (charCount + lineLength > start) {
      // Link is on this line
      return {
        line: i + 1,
        context: lines[i].trim(),
      };
    }
    charCount += lineLength;
  }
  
  return { line: 1, context: '' };
}

/**
 * Build a link index from file contents.
 * 
 * @param files - Map of file path to content (only markdown files with content)
 * @param fileTree - Full file tree for resolution
 * @returns Complete link index
 */
export function buildLinkIndex(
  files: Map<string, string>,
  fileTree: FileTreeNode[]
): LinkIndex {
  const allFiles = flattenFileTree(fileTree);
  const outgoing = new Map<string, LinkInfo[]>();
  const incoming = new Map<string, LinkInfo[]>();
  const nodeSet = new Set<string>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  
  // Process each file
  for (const [filePath, content] of files) {
    const links = findAllWikiLinks(content);
    const outgoingLinks: LinkInfo[] = [];
    
    nodeSet.add(filePath);
    
    for (const link of links) {
      const { path: targetPath, exists } = resolveHref(link.href, allFiles);
      const { line, context } = getContext(content, link.start, link.end);
      
      const linkInfo: LinkInfo = {
        from: filePath,
        to: targetPath,
        href: link.href,
        line,
        context,
      };
      
      outgoingLinks.push(linkInfo);
      
      // Add to incoming links of target
      if (!incoming.has(targetPath)) {
        incoming.set(targetPath, []);
      }
      incoming.get(targetPath)!.push(linkInfo);
      
      // Track nodes and edges
      nodeSet.add(targetPath);
      
      const edgeKey = `${filePath}|${targetPath}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ source: filePath, target: targetPath });
      }
    }
    
    outgoing.set(filePath, outgoingLinks);
  }
  
  // Build nodes array
  const nodes: GraphNode[] = Array.from(nodeSet).map(id => ({
    id,
    label: getBaseName(id),
    exists: allFiles.includes(id),
    outgoingCount: outgoing.get(id)?.length || 0,
    incomingCount: incoming.get(id)?.length || 0,
  }));
  
  return { outgoing, incoming, nodes, edges };
}

/**
 * Get backlinks for a specific file.
 */
export function getBacklinks(index: LinkIndex, filePath: string): LinkInfo[] {
  return index.incoming.get(filePath) || [];
}

/**
 * Get outgoing links for a specific file.
 */
export function getOutgoingLinks(index: LinkIndex, filePath: string): LinkInfo[] {
  return index.outgoing.get(filePath) || [];
}
