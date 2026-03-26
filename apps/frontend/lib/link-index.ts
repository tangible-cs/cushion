/**
 * Link Index
 * 
 * Tracks connections between files (wiki-links).
 * Used by both backlinks panel and graph view.
 */

import { findAllWikiLinks } from './wiki-link';
import { getBaseName } from './path-utils';

export interface LinkInfo {
  from: string;
  to: string;
  href: string;
  line: number;
  context: string;
}

export interface GraphNode {
  id: string;
  label: string;
  exists: boolean;
  outgoingCount: number;
  incomingCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LinkIndex {
  outgoing: Map<string, LinkInfo[]>;
  incoming: Map<string, LinkInfo[]>;
  nodes: GraphNode[];
  edges: GraphEdge[];
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
 * @param allPaths - Flat list of all file paths in the workspace
 * @returns Complete link index
 */
export function buildLinkIndex(
  files: Map<string, string>,
  allPaths: string[]
): LinkIndex {
  const allFiles = allPaths;
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
