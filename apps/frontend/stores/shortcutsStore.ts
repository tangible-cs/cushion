import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { getDefaultBindings, type ShortcutId } from '@/lib/shortcuts/registry';
import { areBindingsEqual, normalizeBindings } from '@/lib/shortcuts/utils';

export type ShortcutOverrides = Partial<Record<ShortcutId, string[]>>;

interface ShortcutsState {
  overrides: ShortcutOverrides;
  setBindings: (id: ShortcutId, bindings: string[]) => void;
  resetBindings: (id: ShortcutId) => void;
  resetAll: () => void;
}

export const useShortcutsStore = create<ShortcutsState>()(
  subscribeWithSelector(
  persist(
    (set, get) => ({
      overrides: {},
      setBindings: (id, bindings) => {
        const normalized = normalizeBindings(bindings);
        const defaults = normalizeBindings(getDefaultBindings(id));

        if (areBindingsEqual(normalized, defaults)) {
          const nextOverrides = { ...get().overrides };
          delete nextOverrides[id];
          set({ overrides: nextOverrides });
          return;
        }

        set((state) => ({
          overrides: {
            ...state.overrides,
            [id]: normalized,
          },
        }));
      },
      resetBindings: (id) => {
        const nextOverrides = { ...get().overrides };
        delete nextOverrides[id];
        set({ overrides: nextOverrides });
      },
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'cushion-shortcuts',
      partialize: (state) => ({ overrides: state.overrides }),
    }
  )
  )
);

export function resolveBindings(id: ShortcutId, overrides: ShortcutOverrides): string[] {
  const override = overrides[id];
  if (override) return normalizeBindings(override);
  return normalizeBindings(getDefaultBindings(id));
}

export function getResolvedBindings(id: ShortcutId): string[] {
  const { overrides } = useShortcutsStore.getState();
  return resolveBindings(id, overrides);
}
