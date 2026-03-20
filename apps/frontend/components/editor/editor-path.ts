interface BuildEditorBreadcrumbInput {
  projectName: string | null;
  currentFile: string | null;
}

export interface EditorBreadcrumb {
  text: string;
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
    return { text: 'New tab', title: 'New tab' };
  }

  const root = projectName?.trim() ?? '';
  const fileSegments = currentFile ? normalizePath(currentFile) : [];

  if (fileSegments.length > 0) {
    const lastIndex = fileSegments.length - 1;
    fileSegments[lastIndex] = stripLastExtension(fileSegments[lastIndex]);
  }

  const segments = root ? [root, ...fileSegments] : fileSegments;
  const breadcrumb = segments.join(' / ');

  if (breadcrumb) {
    return {
      text: breadcrumb,
      title: breadcrumb,
    };
  }

  return {
    text: 'No file selected',
    title: 'No file selected',
  };
}
