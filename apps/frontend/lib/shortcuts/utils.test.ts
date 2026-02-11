import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeShortcut,
  normalizeBindings,
  areBindingsEqual,
  matchShortcut,
  shortcutFromEvent,
  formatShortcut,
  formatShortcutList,
  normalizeShortcutForConflict,
  toCodeMirrorKey,
  isMacPlatform,
} from './utils';

// --- Mock navigator.platform ---

function mockPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    writable: true,
    configurable: true,
  });
}

function createKeyboardEvent(opts: {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: opts.key,
    code: opts.code ?? '',
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

// ------------------------------------------------------------------
// normalizeShortcut
// ------------------------------------------------------------------

describe('normalizeShortcut', () => {
  it('returns null for falsy input', () => {
    expect(normalizeShortcut(null)).toBeNull();
    expect(normalizeShortcut(undefined)).toBeNull();
    expect(normalizeShortcut('')).toBeNull();
  });

  it('normalizes simple key names', () => {
    expect(normalizeShortcut('Escape')).toBe('Escape');
    expect(normalizeShortcut('esc')).toBe('Escape');
    expect(normalizeShortcut('space')).toBe('Space');
    expect(normalizeShortcut('Enter')).toBe('Enter');
    expect(normalizeShortcut('Tab')).toBe('Tab');
  });

  it('normalizes single letter keys to uppercase', () => {
    expect(normalizeShortcut('a')).toBe('A');
    expect(normalizeShortcut('z')).toBe('Z');
  });

  it('normalizes modifier aliases', () => {
    expect(normalizeShortcut('ctrl+s')).toBe('Ctrl+S');
    expect(normalizeShortcut('control+s')).toBe('Ctrl+S');
    expect(normalizeShortcut('cmd+s')).toBe('Cmd+S');
    expect(normalizeShortcut('command+s')).toBe('Cmd+S');
    expect(normalizeShortcut('meta+s')).toBe('Cmd+S');
    expect(normalizeShortcut('option+s')).toBe('Alt+S');
  });

  it('orders modifiers canonically (Mod, Cmd, Ctrl, Alt, Shift)', () => {
    expect(normalizeShortcut('Shift+Ctrl+S')).toBe('Ctrl+Shift+S');
    expect(normalizeShortcut('Alt+Mod+A')).toBe('Mod+Alt+A');
    expect(normalizeShortcut('Shift+Alt+Ctrl+K')).toBe('Ctrl+Alt+Shift+K');
  });

  it('handles Mod modifier', () => {
    expect(normalizeShortcut('Mod+S')).toBe('Mod+S');
    expect(normalizeShortcut('mod+o')).toBe('Mod+O');
  });

  it('normalizes special key names', () => {
    expect(normalizeShortcut('backtick')).toBe('Backtick');
    expect(normalizeShortcut('plus')).toBe('Plus');
    expect(normalizeShortcut('Ctrl+Backtick')).toBe('Ctrl+Backtick');
  });

  it('normalizes + and = to Plus', () => {
    expect(normalizeShortcut('Mod++')).toBe('Mod+Plus');
    expect(normalizeShortcut('Mod+=')).toBe('Mod+Plus');
  });

  it('deduplicates modifiers', () => {
    expect(normalizeShortcut('Ctrl+Ctrl+S')).toBe('Ctrl+S');
  });
});

// ------------------------------------------------------------------
// normalizeShortcutForConflict (Mod equivalence)
// ------------------------------------------------------------------

describe('normalizeShortcutForConflict', () => {
  beforeEach(() => {
    mockPlatform('Win32');
  });

  it('returns null for falsy input', () => {
    expect(normalizeShortcutForConflict(null)).toBeNull();
    expect(normalizeShortcutForConflict('')).toBeNull();
  });

  it('converts Ctrl to Mod on Windows', () => {
    mockPlatform('Win32');
    expect(normalizeShortcutForConflict('Ctrl+S')).toBe('Mod+S');
  });

  it('converts Cmd to Mod on Mac', () => {
    mockPlatform('MacIntel');
    expect(normalizeShortcutForConflict('Cmd+S')).toBe('Mod+S');
  });

  it('keeps Mod as Mod', () => {
    expect(normalizeShortcutForConflict('Mod+O')).toBe('Mod+O');
  });

  it('identifies equivalent bindings across Mod/Ctrl/Cmd', () => {
    mockPlatform('Win32');
    const ctrl = normalizeShortcutForConflict('Ctrl+S');
    const mod = normalizeShortcutForConflict('Mod+S');
    expect(ctrl).toBe(mod);
  });
});

// ------------------------------------------------------------------
// normalizeBindings (dedup with Mod equivalence)
// ------------------------------------------------------------------

describe('normalizeBindings', () => {
  beforeEach(() => {
    mockPlatform('Win32');
  });

  it('returns empty array for empty input', () => {
    expect(normalizeBindings([])).toEqual([]);
  });

  it('filters out null/undefined entries', () => {
    expect(normalizeBindings([null, undefined, ''])).toEqual([]);
  });

  it('normalizes bindings', () => {
    const result = normalizeBindings(['ctrl+s', 'Escape']);
    expect(result).toEqual(['Mod+S', 'Escape']);
  });

  it('deduplicates Mod-equivalent bindings', () => {
    mockPlatform('Win32');
    const result = normalizeBindings(['Ctrl+S', 'Mod+S']);
    expect(result).toEqual(['Mod+S']);
  });

  it('preserves order, keeping first occurrence', () => {
    const result = normalizeBindings(['Enter', 'Tab']);
    expect(result).toEqual(['Enter', 'Tab']);
  });
});

// ------------------------------------------------------------------
// areBindingsEqual
// ------------------------------------------------------------------

describe('areBindingsEqual', () => {
  it('returns true for identical arrays', () => {
    expect(areBindingsEqual(['Mod+S'], ['Mod+S'])).toBe(true);
    expect(areBindingsEqual([], [])).toBe(true);
  });

  it('returns false for different lengths', () => {
    expect(areBindingsEqual(['Mod+S'], ['Mod+S', 'Enter'])).toBe(false);
  });

  it('returns false for different content', () => {
    expect(areBindingsEqual(['Mod+S'], ['Mod+O'])).toBe(false);
  });
});

// ------------------------------------------------------------------
// shortcutFromEvent
// ------------------------------------------------------------------

describe('shortcutFromEvent', () => {
  it('returns null for modifier-only keys', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Control', ctrlKey: true }))).toBeNull();
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Shift', shiftKey: true }))).toBeNull();
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Alt', altKey: true }))).toBeNull();
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Meta', metaKey: true }))).toBeNull();
  });

  it('returns null for Dead key', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Dead' }))).toBeNull();
  });

  it('builds shortcut string from event with modifiers', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: 's', ctrlKey: true }))).toBe('Ctrl+S');
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'o', metaKey: true }))).toBe('Cmd+O');
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'k', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+K');
  });

  it('handles Escape', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Escape' }))).toBe('Escape');
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'Esc' }))).toBe('Escape');
  });

  it('handles Space', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: ' ' }))).toBe('Space');
  });

  it('handles backtick', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: '`' }))).toBe('Backtick');
  });

  it('handles Plus key (ignores shift for + and =)', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: '+', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Plus');
    expect(shortcutFromEvent(createKeyboardEvent({ key: '=', ctrlKey: true }))).toBe('Ctrl+Plus');
  });

  it('uppercases single-character keys', () => {
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'a' }))).toBe('A');
    expect(shortcutFromEvent(createKeyboardEvent({ key: 'z' }))).toBe('Z');
  });

  it('includes multiple modifiers in order: Cmd, Ctrl, Alt, Shift', () => {
    const event = createKeyboardEvent({
      key: 'a',
      metaKey: true,
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(shortcutFromEvent(event)).toBe('Cmd+Ctrl+Alt+Shift+A');
  });
});

// ------------------------------------------------------------------
// matchShortcut
// ------------------------------------------------------------------

describe('matchShortcut', () => {
  beforeEach(() => {
    mockPlatform('Win32');
  });

  it('returns false for empty bindings', () => {
    const event = createKeyboardEvent({ key: 's', ctrlKey: true });
    expect(matchShortcut(event, [])).toBe(false);
    expect(matchShortcut(event, undefined)).toBe(false);
  });

  it('matches exact binding', () => {
    const event = createKeyboardEvent({ key: 's', ctrlKey: true });
    expect(matchShortcut(event, ['Ctrl+S'])).toBe(true);
  });

  it('matches Mod-equivalent binding (Ctrl pressed, Mod+S stored)', () => {
    mockPlatform('Win32');
    const event = createKeyboardEvent({ key: 's', ctrlKey: true });
    expect(matchShortcut(event, ['Mod+S'])).toBe(true);
  });

  it('matches Mod-equivalent binding (Cmd pressed, Mod+S stored) on Mac', () => {
    mockPlatform('MacIntel');
    const event = createKeyboardEvent({ key: 's', metaKey: true });
    expect(matchShortcut(event, ['Mod+S'])).toBe(true);
  });

  it('does not match wrong key', () => {
    const event = createKeyboardEvent({ key: 'o', ctrlKey: true });
    expect(matchShortcut(event, ['Ctrl+S'])).toBe(false);
  });

  it('does not match missing modifier', () => {
    const event = createKeyboardEvent({ key: 's' });
    expect(matchShortcut(event, ['Ctrl+S'])).toBe(false);
  });

  it('matches Escape without modifiers', () => {
    const event = createKeyboardEvent({ key: 'Escape' });
    expect(matchShortcut(event, ['Escape'])).toBe(true);
  });

  it('matches against multiple bindings (first match wins)', () => {
    const event = createKeyboardEvent({ key: 'Enter' });
    expect(matchShortcut(event, ['Tab', 'Enter'])).toBe(true);
  });

  it('does not match extra modifiers not in binding', () => {
    const event = createKeyboardEvent({ key: 's', ctrlKey: true, shiftKey: true });
    expect(matchShortcut(event, ['Ctrl+S'])).toBe(false);
  });
});

// ------------------------------------------------------------------
// formatShortcut
// ------------------------------------------------------------------

describe('formatShortcut', () => {
  it('returns empty string for falsy input', () => {
    expect(formatShortcut(null)).toBe('');
    expect(formatShortcut(undefined)).toBe('');
    expect(formatShortcut('')).toBe('');
  });

  it('formats Escape as Esc', () => {
    expect(formatShortcut('Escape')).toBe('Esc');
  });

  it('formats arrow keys as short names', () => {
    expect(formatShortcut('ArrowUp')).toBe('Up');
    expect(formatShortcut('ArrowDown')).toBe('Down');
    expect(formatShortcut('ArrowLeft')).toBe('Left');
    expect(formatShortcut('ArrowRight')).toBe('Right');
  });

  it('formats Backtick as `', () => {
    expect(formatShortcut('Backtick')).toBe('`');
  });

  it('formats Plus as +', () => {
    expect(formatShortcut('Plus')).toBe('+');
  });

  it('formats Mod as platform-appropriate key', () => {
    mockPlatform('Win32');
    expect(formatShortcut('Mod+S')).toBe('Ctrl+S');

    mockPlatform('MacIntel');
    expect(formatShortcut('Mod+S')).toBe('Cmd+S');
  });

  it('formats compound shortcuts', () => {
    mockPlatform('Win32');
    expect(formatShortcut('Ctrl+Shift+K')).toBe('Ctrl+Shift+K');
  });
});

// ------------------------------------------------------------------
// formatShortcutList
// ------------------------------------------------------------------

describe('formatShortcutList', () => {
  it('returns empty string for no bindings', () => {
    expect(formatShortcutList([])).toBe('');
    expect(formatShortcutList(undefined)).toBe('');
  });

  it('joins multiple bindings with /', () => {
    expect(formatShortcutList(['Enter', 'Tab'])).toBe('Enter / Tab');
  });

  it('formats each binding', () => {
    expect(formatShortcutList(['Escape'])).toBe('Esc');
  });
});

// ------------------------------------------------------------------
// toCodeMirrorKey
// ------------------------------------------------------------------

describe('toCodeMirrorKey', () => {
  it('returns null for invalid input', () => {
    expect(toCodeMirrorKey('')).toBeNull();
  });

  it('converts Mod+S to Mod-s', () => {
    expect(toCodeMirrorKey('Mod+S')).toBe('Mod-s');
  });

  it('converts Shift+Tab to Shift-Tab', () => {
    expect(toCodeMirrorKey('Shift+Tab')).toBe('Shift-Tab');
  });

  it('converts single keys', () => {
    expect(toCodeMirrorKey('Enter')).toBe('Enter');
    expect(toCodeMirrorKey('Tab')).toBe('Tab');
    expect(toCodeMirrorKey('Escape')).toBe('Escape');
  });

  it('converts Backtick to `', () => {
    expect(toCodeMirrorKey('Backtick')).toBe('`');
    expect(toCodeMirrorKey('Ctrl+Backtick')).toBe('Ctrl-`');
  });

  it('converts Plus to =', () => {
    expect(toCodeMirrorKey('Mod+Plus')).toBe('Mod-=');
  });

  it('lowercases single character keys', () => {
    expect(toCodeMirrorKey('A')).toBe('a');
    expect(toCodeMirrorKey('Ctrl+K')).toBe('Ctrl-k');
  });
});
