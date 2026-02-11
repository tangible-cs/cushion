import type { ShortcutId } from './registry';

const MODIFIER_ORDER = ['Mod', 'Cmd', 'Ctrl', 'Alt', 'Shift'] as const;
const MODIFIER_ALIASES: Record<string, string> = {
  cmd: 'Cmd',
  command: 'Cmd',
  meta: 'Cmd',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  mod: 'Mod',
};

const KEY_ALIASES: Record<string, string> = {
  esc: 'Escape',
  escape: 'Escape',
  spacebar: 'Space',
  space: 'Space',
  backtick: 'Backtick',
  plus: 'Plus',
};

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'Cmd', 'Command', 'Ctrl', 'AltGraph']);

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}

function normalizeKeyName(rawKey: string): string | null {
  const trimmed = rawKey.trim();
  if (!trimmed) return null;
  const alias = KEY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  if (trimmed === ' ') return 'Space';
  if (trimmed === '`') return 'Backtick';

  if (trimmed === '+' || trimmed === '=') return 'Plus';
  if (trimmed === '_') return '-';

  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

function normalizeModifier(token: string): string | null {
  const normalized = MODIFIER_ALIASES[token.trim().toLowerCase()];
  return normalized || null;
}

export function normalizeShortcut(input?: string | null): string | null {
  if (!input) return null;
  // Handle + or = as key when it appears after a modifier separator
  const preprocessed = input.replace(/\+(\+|=)$/, '+Plus');
  const parts = preprocessed.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const part of parts) {
    const modifier = normalizeModifier(part);
    if (modifier) {
      modifiers.add(modifier);
      continue;
    }
    if (!key) {
      key = normalizeKeyName(part);
    }
  }

  if (!key) return null;

  const orderedModifiers = MODIFIER_ORDER.filter((mod) => modifiers.has(mod));
  return [...orderedModifiers, key].join('+');
}

export function normalizeBindings(bindings: Array<string | null | undefined>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const binding of bindings) {
    const normalizedBinding = normalizeShortcut(binding);
    if (!normalizedBinding) continue;
    const canonicalBinding = toModShortcut(normalizedBinding);
    if (seen.has(canonicalBinding)) continue;
    seen.add(canonicalBinding);
    normalized.push(canonicalBinding);
  }
  return normalized;
}

export function areBindingsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function normalizeEventKey(event: KeyboardEvent): { key: string; ignoreShift: boolean } | null {
  let key = event.key;
  if (!key) return null;
  if (key === 'Dead') return null;

  if (MODIFIER_KEYS.has(key)) return null;

  if (key === ' ') key = 'Space';
  if (key === 'Esc') key = 'Escape';

  if (isMacPlatform() && event.altKey && event.code && event.code.startsWith('Key')) {
    key = event.code.replace('Key', '');
  }

  if (key === '`') return { key: 'Backtick', ignoreShift: false };
  if (key === '+' || key === '=') return { key: 'Plus', ignoreShift: true };
  if (key === '_') return { key: '-', ignoreShift: true };

  if (key.length === 1) {
    key = key.toUpperCase();
  }

  return { key, ignoreShift: false };
}

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const normalizedKey = normalizeEventKey(event);
  if (!normalizedKey) return null;

  const modifiers: string[] = [];
  if (event.metaKey) modifiers.push('Cmd');
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey && !normalizedKey.ignoreShift) modifiers.push('Shift');

  return [...modifiers, normalizedKey.key].join('+');
}

function toModShortcut(shortcut: string): string {
  if (!shortcut) return shortcut;
  const parts = shortcut.split('+');
  const next = parts.map((part) => {
    if (isMacPlatform()) return part === 'Cmd' ? 'Mod' : part;
    return part === 'Ctrl' ? 'Mod' : part;
  });
  return next.join('+');
}

export function normalizeShortcutForConflict(input?: string | null): string | null {
  const normalized = normalizeShortcut(input);
  if (!normalized) return null;
  return toModShortcut(normalized);
}

export function matchShortcut(event: KeyboardEvent, bindings?: string[]): boolean {
  if (!bindings || bindings.length === 0) return false;
  const pressed = shortcutFromEvent(event);
  if (!pressed) return false;
  const normalizedPressed = normalizeShortcut(pressed);
  if (!normalizedPressed) return false;
  const modPressed = toModShortcut(normalizedPressed);

  for (const binding of bindings) {
    const normalizedBinding = normalizeShortcut(binding);
    if (!normalizedBinding) continue;
    if (normalizedBinding === normalizedPressed || normalizedBinding === modPressed) {
      return true;
    }
  }
  return false;
}

function formatKeyToken(token: string): string {
  if (token === 'Mod') return isMacPlatform() ? 'Cmd' : 'Ctrl';
  if (token === 'Cmd') return 'Cmd';
  if (token === 'Ctrl') return 'Ctrl';
  if (token === 'Alt') return 'Alt';
  if (token === 'Shift') return 'Shift';
  if (token === 'Escape') return 'Esc';
  if (token === 'ArrowUp') return 'Up';
  if (token === 'ArrowDown') return 'Down';
  if (token === 'ArrowLeft') return 'Left';
  if (token === 'ArrowRight') return 'Right';
  if (token === 'Backtick') return '`';
  if (token === 'Plus') return '+';
  return token;
}

export function formatShortcut(binding?: string | null): string {
  const normalized = normalizeShortcut(binding);
  if (!normalized) return '';
  const parts = normalized.split('+').map(formatKeyToken);
  return parts.join('+');
}

export function formatShortcutList(bindings?: string[]): string {
  if (!bindings || bindings.length === 0) return '';
  const formatted = bindings.map(formatShortcut).filter(Boolean);
  return formatted.join(' / ');
}

export function toCodeMirrorKey(binding: string): string | null {
  const normalized = normalizeShortcut(binding);
  if (!normalized) return null;
  const parts = normalized.split('+');
  const key = parts.pop();
  if (!key) return null;
  const cmKey = parts.map((part) => part).join('-');

  let cmKeyName = key;
  if (cmKeyName === 'Backtick') cmKeyName = '`';
  if (cmKeyName === 'Plus') cmKeyName = '=';
  if (cmKeyName.length === 1) cmKeyName = cmKeyName.toLowerCase();

  return cmKey ? `${cmKey}-${cmKeyName}` : cmKeyName;
}

export type ShortcutBindingMap = Record<ShortcutId, string[]>;
