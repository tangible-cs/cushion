import type { TrashItem } from '@cushion/types';
import type { WorkspaceManager } from '../workspace-manager';

export async function handleTrashRestore(
  workspaceManager: WorkspaceManager,
  params: { ids: string[] }
): Promise<{ success: boolean; restoredPaths: string[] }> {
  const restoredPaths = await workspaceManager.restoreFromTrash(params.ids);
  return { success: true, restoredPaths };
}

export function handleTrashList(
  workspaceManager: WorkspaceManager
): { items: TrashItem[] } {
  return { items: workspaceManager.listTrash() };
}

export async function handleTrashPermanentDelete(
  workspaceManager: WorkspaceManager,
  params: { ids: string[] }
): Promise<{ success: boolean }> {
  await workspaceManager.permanentlyDeleteFromTrash(params.ids);
  return { success: true };
}

export async function handleTrashEmpty(
  workspaceManager: WorkspaceManager
): Promise<{ success: boolean }> {
  await workspaceManager.emptyTrash();
  return { success: true };
}
