/**
 * Model sorting utilities.
 *
 * The canonical list of popular provider IDs lives in `lib/popular-providers.ts`.
 *
 * This module provides a reusable comparator so sorting logic is not
 * duplicated across ModelSelector and ManageModelsDialog.
 */

type ModelSortEntry = {
  providerID: string;
  providerName: string;
  modelName: string;
};

/**
 * Build a comparator that sorts models by provider popularity, then by
 * provider name, then by model name.
 */
export function createModelSorter(popularProviderIDs: string[]) {
  return (a: ModelSortEntry, b: ModelSortEntry): number => {
    const aIndex = popularProviderIDs.indexOf(a.providerID);
    const bIndex = popularProviderIDs.indexOf(b.providerID);

    if (aIndex >= 0 && bIndex < 0) return -1;
    if (aIndex < 0 && bIndex >= 0) return 1;
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;

    if (a.providerName !== b.providerName) {
      return a.providerName.localeCompare(b.providerName);
    }
    return a.modelName.localeCompare(b.modelName);
  };
}
