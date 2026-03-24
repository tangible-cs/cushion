import type { ComponentType } from 'react';

export interface ViewProps {
  filePath: string;
}

export interface ViewRegistration {
  id: string;
  displayName: string;
  component: ComponentType<ViewProps>;
  extensions: string[];
}

const viewsById = new Map<string, ViewRegistration>();
const extensionIndex = new Map<string, string>(); // ext → view id

/** Strip leading dot so both "png" and ".png" work. */
function normalizeExt(ext: string): string {
  return ext.replace(/^\./, '').toLowerCase();
}

export function registerView(
  id: string,
  config: { displayName: string; component: ComponentType<ViewProps>; extensions: string[] },
): void {
  const registration: ViewRegistration = { id, ...config };
  viewsById.set(id, registration);
  for (const ext of config.extensions) {
    extensionIndex.set(normalizeExt(ext), id);
  }
}

export function getViewForFile(filePath: string): ViewRegistration | null {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = filePath.slice(dot + 1).toLowerCase();
  const id = extensionIndex.get(ext);
  if (!id) return null;
  return viewsById.get(id) ?? null;
}
