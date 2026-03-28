import { globalShortcut } from 'electron';

export class HotkeyManager {
  private currentHotkey: string | null = null;

  constructor(
    private notifyRenderer: (channel: string, data: unknown) => void,
  ) {}

  register(hotkey: string): boolean {
    const previousHotkey = this.currentHotkey;

    try {
      const ok = globalShortcut.register(hotkey, () => {
        this.notifyRenderer('dictation/hotkey-pressed', {});
      });

      if (!ok) {
        this.notifyRenderer('dictation/hotkey-registration-failed', { hotkey, error: `Failed to register hotkey "${hotkey}" — it may be in use by another application.` });
        return false;
      }

      if (previousHotkey && previousHotkey !== hotkey) {
        try {
          globalShortcut.unregister(previousHotkey);
        } catch {}
      }

      this.currentHotkey = hotkey;
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.notifyRenderer('dictation/hotkey-registration-failed', { hotkey, error: message });
      return false;
    }
  }

  unregister() {
    if (this.currentHotkey) {
      try {
        globalShortcut.unregister(this.currentHotkey);
      } catch {}
      this.currentHotkey = null;
    }
  }

  dispose() {
    this.unregister();
  }
}
