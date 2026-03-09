import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@/lib/config-defaults';

// We need to reset the store between tests since Zustand stores are singletons.
// Re-import after each reset.
let useAppearanceStore: typeof import('./appearanceStore').useAppearanceStore;

beforeEach(async () => {
  // Mock matchMedia for system theme detection
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false, // default: light system theme
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));

  // Reset module to get a fresh store
  vi.resetModules();
  const mod = await import('./appearanceStore');
  useAppearanceStore = mod.useAppearanceStore;
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('matches DEFAULT_APPEARANCE values', () => {
    const state = useAppearanceStore.getState();
    expect(state.theme).toBe(DEFAULT_APPEARANCE.theme);
    expect(state.accentColor).toBe(DEFAULT_APPEARANCE.accentColor);
    expect(state.baseFontSize).toBe(DEFAULT_APPEARANCE.baseFontSize);
  });

  it('resolvedTheme is computed from theme + system', () => {
    const state = useAppearanceStore.getState();
    // theme is 'system', matchMedia returns false (light)
    expect(state.resolvedTheme).toBe('light');
  });
});

// ---------------------------------------------------------------------------
// setTheme
// ---------------------------------------------------------------------------

describe('setTheme', () => {
  it('sets theme to dark', () => {
    useAppearanceStore.getState().setTheme('dark');
    const state = useAppearanceStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.resolvedTheme).toBe('dark');
  });

  it('sets theme to light', () => {
    useAppearanceStore.getState().setTheme('light');
    const state = useAppearanceStore.getState();
    expect(state.theme).toBe('light');
    expect(state.resolvedTheme).toBe('light');
  });

  it('system theme resolves based on matchMedia', async () => {
    // Re-mock matchMedia to return dark
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true, // dark system theme
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.resetModules();
    const mod = await import('./appearanceStore');

    mod.useAppearanceStore.getState().setTheme('system');
    expect(mod.useAppearanceStore.getState().resolvedTheme).toBe('dark');
  });
});

// ---------------------------------------------------------------------------
// setters
// ---------------------------------------------------------------------------

describe('individual setters', () => {
  it('setAccentColor', () => {
    useAppearanceStore.getState().setAccentColor('258 88 66');
    expect(useAppearanceStore.getState().accentColor).toBe('258 88 66');
  });

  it('setBaseFontSize', () => {
    useAppearanceStore.getState().setBaseFontSize(20);
    expect(useAppearanceStore.getState().baseFontSize).toBe(20);
  });

  it('setTextFontFamily', () => {
    useAppearanceStore.getState().setTextFontFamily('Inter');
    expect(useAppearanceStore.getState().textFontFamily).toBe('Inter');
  });

  it('setMonospaceFontFamily', () => {
    useAppearanceStore.getState().setMonospaceFontFamily('JetBrains Mono');
    expect(useAppearanceStore.getState().monospaceFontFamily).toBe('JetBrains Mono');
  });

  it('setInterfaceFontFamily', () => {
    useAppearanceStore.getState().setInterfaceFontFamily('SF Pro');
    expect(useAppearanceStore.getState().interfaceFontFamily).toBe('SF Pro');
  });
});

// ---------------------------------------------------------------------------
// loadAppearance
// ---------------------------------------------------------------------------

describe('loadAppearance', () => {
  it('applies all fields from config', () => {
    useAppearanceStore.getState().loadAppearance({
      theme: 'dark',
      accentColor: '100 50 50',
      baseFontSize: 18,
      textFontFamily: 'Georgia',
      monospaceFontFamily: 'Fira Code',
      interfaceFontFamily: 'Helvetica',
    });

    const state = useAppearanceStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.resolvedTheme).toBe('dark');
    expect(state.accentColor).toBe('100 50 50');
    expect(state.baseFontSize).toBe(18);
  });

  it('partial data merges with defaults', () => {
    useAppearanceStore.getState().loadAppearance({ theme: 'light' });

    const state = useAppearanceStore.getState();
    expect(state.theme).toBe('light');
    // Other fields should be defaults
    expect(state.baseFontSize).toBe(DEFAULT_APPEARANCE.baseFontSize);
  });

  it('empty object resets to defaults', () => {
    // First set something custom
    useAppearanceStore.getState().setAccentColor('999 99 99');

    // Load empty
    useAppearanceStore.getState().loadAppearance({});

    expect(useAppearanceStore.getState().accentColor).toBe(DEFAULT_APPEARANCE.accentColor);
  });
});

// ---------------------------------------------------------------------------
// getConfig
// ---------------------------------------------------------------------------

describe('getConfig', () => {
  it('returns serializable config without computed fields or functions', () => {
    useAppearanceStore.getState().setTheme('dark');
    useAppearanceStore.getState().setAccentColor('200 80 50');

    const config = useAppearanceStore.getState().getConfig();

    expect(config.theme).toBe('dark');
    expect(config.accentColor).toBe('200 80 50');

    // Should NOT contain computed fields or functions
    expect(config).not.toHaveProperty('resolvedTheme');
    expect(config).not.toHaveProperty('setTheme');
    expect(config).not.toHaveProperty('loadAppearance');
    expect(config).not.toHaveProperty('getConfig');
  });

  it('roundtrip: getConfig → loadAppearance preserves state', () => {
    useAppearanceStore.getState().loadAppearance({
      theme: 'dark',
      accentColor: '150 60 40',
      baseFontSize: 14,
    });

    const config = useAppearanceStore.getState().getConfig();

    // Reset
    useAppearanceStore.getState().loadAppearance({});

    // Reload from config
    useAppearanceStore.getState().loadAppearance(config);

    const state = useAppearanceStore.getState();
    expect(state.theme).toBe('dark');
    expect(state.accentColor).toBe('150 60 40');
    expect(state.baseFontSize).toBe(14);
  });
});
