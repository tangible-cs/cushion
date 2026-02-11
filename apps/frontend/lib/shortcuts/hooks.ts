'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { ShortcutId } from './registry';
import { matchShortcut } from './utils';
import { resolveBindings } from '@/stores/shortcutsStore';
import { useShortcutsStore } from '@/stores/shortcutsStore';

export function useShortcutBindings<const T extends readonly ShortcutId[]>(ids: T): Record<T[number], string[]> {
  const overrides = useShortcutsStore((state) => state.overrides);

  return useMemo(() => {
    const result = {} as Record<ShortcutId, string[]>;
    ids.forEach((id) => {
      result[id] = resolveBindings(id, overrides);
    });
    return result as Record<T[number], string[]>;
  }, [ids, overrides]);
}

// --- useShortcutHandler (US-E1) ---

type ShortcutHandler = (event: KeyboardEvent) => void;

type UseShortcutHandlerOptions = {
  /** Map of shortcut IDs to handler functions. */
  handlers: Partial<Record<ShortcutId, ShortcutHandler>>;
  /** Whether the listeners are active. Default: true. */
  enabled?: boolean;
  /** Event target: 'document' or 'window'. Default: 'document'. */
  target?: 'document' | 'window';
  /** Listen in capture phase. Default: false. */
  capture?: boolean;
};

/**
 * Shared hook for keyboard shortcut handling (US-E1).
 *
 * Replaces the repeated pattern of:
 *   useEffect → addEventListener('keydown') → matchShortcut → preventDefault → action
 *
 * Features:
 * - Resolves bindings reactively from the shortcuts store.
 * - Skips events that are already `defaultPrevented`.
 * - Calls `preventDefault()` when a handler matches.
 * - Manages addEventListener/removeEventListener lifecycle.
 *
 * Does NOT replace:
 * - React `onKeyDown` handlers (QuickSwitcher, PromptInput)
 * - `useOverlayClose` (overlay close + click-outside)
 * - CodeMirror keymaps (uses CM's own keymap system)
 */
export function useShortcutHandler({
  handlers,
  enabled = true,
  target = 'document',
  capture = false,
}: UseShortcutHandlerOptions): void {
  const overrides = useShortcutsStore((state) => state.overrides);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    // Resolve all bindings once per effect run
    const entries = Object.entries(handlersRef.current) as [ShortcutId, ShortcutHandler][];
    const resolved = entries.map(([id, handler]) => ({
      bindings: resolveBindings(id, overrides),
      handler,
    }));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      for (const { bindings, handler } of resolved) {
        if (matchShortcut(e, bindings)) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };

    const eventTarget = target === 'window' ? window : document;
    eventTarget.addEventListener('keydown', handleKeyDown as EventListener, capture);
    return () => {
      eventTarget.removeEventListener('keydown', handleKeyDown as EventListener, capture);
    };
  }, [enabled, overrides, target, capture]);
}

// --- useOverlayClose (US-A4) ---

type UseOverlayCloseOptions = {
  /** Whether the overlay is currently open. Listeners only attach when true. */
  isOpen: boolean;
  /** Called when the overlay should close. */
  onClose: () => void;
  /** Shortcut ID to listen for. Defaults to 'app.overlay.close'. */
  shortcutId?: ShortcutId;
  /** Refs whose elements are considered "inside" the overlay for click-outside.
   *  If provided, clicks outside all of these elements will trigger close. */
  insideRefs?: RefObject<HTMLElement | null>[];
  /** Listen in capture phase (true) or bubble phase (false). Default: false. */
  capture?: boolean;
};

/**
 * Shared hook for overlay close behavior (US-A4).
 *
 * Handles two concerns:
 * 1. Close on shortcut (defaults to `app.overlay.close` / Escape).
 * 2. Close on click-outside (when `insideRefs` is provided).
 *
 * Used by Popover, ContextMenu, and any future overlay components.
 */
export function useOverlayClose({
  isOpen,
  onClose,
  shortcutId = 'app.overlay.close' as ShortcutId,
  insideRefs,
  capture = false,
}: UseOverlayCloseOptions): void {
  const overrides = useShortcutsStore((state) => state.overrides);

  // Refs for latest values — avoids effect re-runs when callbacks/arrays
  // are new references but semantically unchanged.
  const onCloseRef = useRef(onClose);
  const insideRefsRef = useRef(insideRefs);
  onCloseRef.current = onClose;
  insideRefsRef.current = insideRefs;

  useEffect(() => {
    if (!isOpen) return;

    const bindings = resolveBindings(shortcutId, overrides);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (matchShortcut(e, bindings)) {
        e.preventDefault();
        onCloseRef.current();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const refs = insideRefsRef.current;
      if (!refs || refs.length === 0) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (refs.some((ref) => ref.current?.contains(target))) return;
      onCloseRef.current();
    };

    const hasClickOutside = !!insideRefsRef.current && insideRefsRef.current.length > 0;

    document.addEventListener('keydown', handleKeyDown, capture);
    if (hasClickOutside) {
      document.addEventListener('pointerdown', handlePointerDown, capture);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown, capture);
      if (hasClickOutside) {
        document.removeEventListener('pointerdown', handlePointerDown, capture);
      }
    };
  }, [isOpen, shortcutId, overrides, capture]);
}
