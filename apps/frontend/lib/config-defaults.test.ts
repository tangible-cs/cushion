import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACE,
  DEFAULT_APPEARANCE,
  DEFAULT_CHAT,
} from './config-defaults';
import type {
  CushionSettings,
  CushionWorkspace,
  CushionAppearance,
  CushionChat,
} from '@cushion/types';

describe('DEFAULT_SETTINGS', () => {
  it('has all CushionSettings keys', () => {
    const keys: (keyof CushionSettings)[] = [
      'readableLineLength',
      'showLineNumber',
      'spellcheck',
      'autoSave',
      'autoSaveDelay',
      'autoPairBrackets',
      'foldHeading',
      'foldIndent',
      'showHiddenFiles',
      'showCushionFiles',
      'fileSortOrder',
    ];

    for (const key of keys) {
      expect(DEFAULT_SETTINGS).toHaveProperty(key);
      expect(DEFAULT_SETTINGS[key]).not.toBeUndefined();
    }
  });

  it('has valid enum values', () => {
    expect(['alphabetical', 'modified', 'created']).toContain(DEFAULT_SETTINGS.fileSortOrder);
  });

  it('autoSaveDelay is a positive number', () => {
    expect(DEFAULT_SETTINGS.autoSaveDelay).toBeGreaterThan(0);
  });
});

describe('DEFAULT_APPEARANCE', () => {
  it('has all CushionAppearance keys', () => {
    const keys: (keyof CushionAppearance)[] = [
      'theme',
      'accentColor',
      'baseFontSize',
      'textFontFamily',
      'monospaceFontFamily',
      'interfaceFontFamily',
      'sidebarWidth',
    ];

    for (const key of keys) {
      expect(DEFAULT_APPEARANCE).toHaveProperty(key);
    }
  });

  it('theme is a valid value', () => {
    expect(['light', 'dark', 'system']).toContain(DEFAULT_APPEARANCE.theme);
  });

  it('baseFontSize is reasonable', () => {
    expect(DEFAULT_APPEARANCE.baseFontSize).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_APPEARANCE.baseFontSize).toBeLessThanOrEqual(32);
  });

});

describe('DEFAULT_WORKSPACE', () => {
  it('has all CushionWorkspace keys', () => {
    const keys: (keyof CushionWorkspace)[] = [
      'tabs',
      'activeTab',
      'rightPanel',
      'lastOpenFiles',
    ];

    for (const key of keys) {
      expect(DEFAULT_WORKSPACE).toHaveProperty(key);
    }
  });

  it('starts with no tabs', () => {
    expect(DEFAULT_WORKSPACE.tabs).toEqual([]);
  });

  it('activeTab is null by default', () => {
    expect(DEFAULT_WORKSPACE.activeTab).toBeNull();
  });

  it('rightPanel has valid structure', () => {
    expect(DEFAULT_WORKSPACE.rightPanel.mode).toBe('none');
    expect(DEFAULT_WORKSPACE.rightPanel.width).toBeGreaterThan(0);
  });
});

describe('DEFAULT_CHAT', () => {
  it('has all CushionChat keys', () => {
    const keys: (keyof CushionChat)[] = [
      'baseUrl',
      'selectedModel',
      'selectedAgent',
      'selectedVariant',
      'displayPreferences',
      'modelVisibility',
    ];

    for (const key of keys) {
      expect(DEFAULT_CHAT).toHaveProperty(key);
    }
  });

  it('selectedModel/Agent/Variant default to null', () => {
    expect(DEFAULT_CHAT.selectedModel).toBeNull();
    expect(DEFAULT_CHAT.selectedAgent).toBeNull();
    expect(DEFAULT_CHAT.selectedVariant).toBeNull();
  });

  it('displayPreferences has valid defaults', () => {
    expect(DEFAULT_CHAT.displayPreferences).toEqual({
      showThinking: true,
      shellToolPartsExpanded: true,
      editToolPartsExpanded: false,
    });
  });

  it('modelVisibility starts empty', () => {
    expect(DEFAULT_CHAT.modelVisibility).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Merge-with-defaults pattern
// ---------------------------------------------------------------------------

describe('merge with defaults pattern', () => {
  it('partial settings merged with defaults fills missing keys', () => {
    const partial: CushionSettings = { showLineNumber: true };
    const merged = { ...DEFAULT_SETTINGS, ...partial };

    expect(merged.showLineNumber).toBe(true); // overridden
    expect(merged.spellcheck).toBe(true); // from default
    expect(merged.autoSaveDelay).toBe(1000); // from default
  });

  it('empty object returns all defaults', () => {
    const merged = { ...DEFAULT_SETTINGS, ...{} };
    expect(merged).toEqual(DEFAULT_SETTINGS);
  });

  it('extra keys in parsed data are preserved', () => {
    const parsed = { showLineNumber: true, futureKey: 'value' } as any;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    expect(merged.futureKey).toBe('value');
  });
});
