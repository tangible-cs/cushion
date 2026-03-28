import { useState, useEffect, useCallback, useRef } from 'react';
import { useDictationStore } from '@/stores/dictationStore';

const KEY_MAP: Record<string, string> = {
  Control: 'Control',
  Alt: 'Alt',
  Shift: 'Shift',
  Meta: 'Super',
};

function buildAccelerator(e: KeyboardEvent): string | null {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');

  const key = e.key;
  if (key === 'Escape') return null;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null;

  const mapped = key.length === 1 ? key.toUpperCase() : key;
  parts.push(mapped);
  return parts.join('+');
}

export function DictationHotkeyPicker() {
  const hotkey = useDictationStore((s) => s.hotkey);
  const updateHotkey = useDictationStore((s) => s.updateHotkey);
  const [listening, setListening] = useState(false);
  const [preview, setPreview] = useState('');
  const pressedModifiers = useRef(new Set<string>());

  const startListening = useCallback(() => {
    pressedModifiers.current.clear();
    setPreview('');
    setListening(true);
  }, []);

  const cancel = useCallback(() => {
    setListening(false);
    setPreview('');
    pressedModifiers.current.clear();
  }, []);

  useEffect(() => {
    if (!listening) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        cancel();
        return;
      }

      const mod = KEY_MAP[e.key];
      if (mod) {
        pressedModifiers.current.add(mod);
        setPreview([...pressedModifiers.current].join('+'));
        return;
      }

      const accel = buildAccelerator(e);
      if (accel) {
        setListening(false);
        setPreview('');
        pressedModifiers.current.clear();
        updateHotkey(accel);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const mod = KEY_MAP[e.key];
      if (!mod) return;

      // If we have modifiers tracked and a modifier was released, accept modifier-only combo
      const mods = pressedModifiers.current;
      if (mods.size >= 2) {
        const accel = [...mods].join('+');
        setListening(false);
        setPreview('');
        pressedModifiers.current.clear();
        updateHotkey(accel);
      } else {
        mods.delete(mod);
        setPreview(mods.size > 0 ? [...mods].join('+') : '');
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [listening, cancel, updateHotkey]);

  const display = listening ? (preview || 'Press keys...') : (hotkey || 'Not set');

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Global Hotkey</label>
      <p className="text-xs text-muted-foreground">
        Toggle dictation recording from anywhere with a keyboard shortcut.
      </p>
      <div className="flex items-center gap-2">
        <kbd className="px-3 py-1.5 text-sm font-mono bg-[var(--overlay-5)] border border-border rounded-md min-w-[120px] text-center">
          {display}
        </kbd>
        {listening ? (
          <button
            onClick={cancel}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-[var(--overlay-5)] transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={startListening}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-[var(--overlay-5)] transition-colors"
          >
            Change
          </button>
        )}
      </div>
    </div>
  );
}
