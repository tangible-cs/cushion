import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CushionAppearance } from '@cushion/types';
import { DEFAULT_APPEARANCE } from '@/lib/config-defaults';

interface AppearanceState extends Required<CushionAppearance> {
  /** Computed from theme + system preference */
  resolvedTheme: 'light' | 'dark';

  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setAccentColor: (color: string) => void;
  setBaseFontSize: (size: number) => void;
  setTextFontFamily: (font: string) => void;
  setMonospaceFontFamily: (font: string) => void;
  setInterfaceFontFamily: (font: string) => void;

  /** Load all appearance values at once (from config file) */
  loadAppearance: (data: CushionAppearance) => void;

  /** Get serializable config (without computed fields) */
  getConfig: () => CushionAppearance;
}

function resolveTheme(theme: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useAppearanceStore = create<AppearanceState>()(
  subscribeWithSelector((set, get) => ({
    ...DEFAULT_APPEARANCE,
    resolvedTheme: resolveTheme(DEFAULT_APPEARANCE.theme),

    setTheme: (theme) =>
      set({ theme, resolvedTheme: resolveTheme(theme) }),

    setAccentColor: (accentColor) => set({ accentColor }),
    setBaseFontSize: (baseFontSize) => set({ baseFontSize }),
    setTextFontFamily: (textFontFamily) => set({ textFontFamily }),
    setMonospaceFontFamily: (monospaceFontFamily) => set({ monospaceFontFamily }),
    setInterfaceFontFamily: (interfaceFontFamily) => set({ interfaceFontFamily }),

    loadAppearance: (data) => {
      const merged = { ...DEFAULT_APPEARANCE, ...data };
      set({
        ...merged,
        resolvedTheme: resolveTheme(merged.theme),
      });
    },

    getConfig: () => {
      const { resolvedTheme, setTheme, setAccentColor, setBaseFontSize, setTextFontFamily, setMonospaceFontFamily, setInterfaceFontFamily, loadAppearance, getConfig, ...config } = get();
      return config;
    },
  }))
);
