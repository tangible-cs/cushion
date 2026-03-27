export const isElectron = !!window.electronAPI;
export const noDragStyle = isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : undefined;

interface BuildEditorBreadcrumbInput {
  projectName: string | null;
  currentFile: string | null;
}

export interface BreadcrumbSegment {
  label: string;
  /** Directory path to reveal in explorer, or null for non-navigable segments (project root, current file). */
  dirPath: string | null;
}

export interface EditorBreadcrumb {
  segments: BreadcrumbSegment[];
  title: string;
}

function normalizePath(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
}

function stripLastExtension(segment: string): string {
  const lastDot = segment.lastIndexOf('.');
  if (lastDot <= 0) {
    return segment;
  }

  return segment.slice(0, lastDot);
}

export function buildEditorBreadcrumb({
  projectName,
  currentFile,
}: BuildEditorBreadcrumbInput): EditorBreadcrumb {
  if (currentFile === '__new_tab__') {
    return { segments: [{ label: 'New tab', dirPath: null }], title: 'New tab' };
  }

  const root = projectName?.trim() ?? '';
  const fileSegments = currentFile ? normalizePath(currentFile) : [];

  // Build directory paths for intermediate folders
  // e.g. ["a", "b", "file.md"] → dirPaths: ["a", "a/b", null]
  const dirPaths: (string | null)[] = [];
  for (let i = 0; i < fileSegments.length; i++) {
    if (i < fileSegments.length - 1) {
      dirPaths.push(fileSegments.slice(0, i + 1).join('/'));
    } else {
      dirPaths.push(null);
    }
  }

  if (fileSegments.length > 0) {
    const lastIndex = fileSegments.length - 1;
    fileSegments[lastIndex] = stripLastExtension(fileSegments[lastIndex]);
  }

  const segments: BreadcrumbSegment[] = [];

  if (root) {
    segments.push({ label: root, dirPath: null });
  }

  for (let i = 0; i < fileSegments.length; i++) {
    segments.push({ label: fileSegments[i], dirPath: dirPaths[i] });
  }

  if (segments.length > 0) {
    return {
      segments,
      title: segments.map((s) => s.label).join(' / '),
    };
  }

  return {
    segments: [],
    title: 'No file selected',
  };
}
