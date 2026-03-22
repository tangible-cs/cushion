
import { useAppearanceStore } from '@/stores/appearanceStore';
import { AccentColorPicker } from './AccentColorPicker';
import { cn } from '@/lib/utils';

interface AppearanceSettingsProps {
  embedded?: boolean;
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function AppearanceSettings({ embedded = false }: AppearanceSettingsProps) {
  const theme = useAppearanceStore((s) => s.theme);
  const accentColor = useAppearanceStore((s) => s.accentColor);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setAccentColor = useAppearanceStore((s) => s.setAccentColor);

  return (
    <div className={cn(embedded ? 'px-6 py-4 border-b border-border' : 'p-6 overflow-y-auto')}>
      <h2
        className={cn(
          embedded
            ? 'text-xs uppercase tracking-wide text-foreground-faint mb-3'
            : 'text-base font-semibold mb-4'
        )}
      >
        Appearance
      </h2>

      {/* Theme selector */}
      <div className="py-2">
        <div className="text-sm font-medium mb-2">Theme</div>
        <div className="flex gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-md border transition-colors',
                theme === opt.value
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)] text-foreground'
                  : 'border-border text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="py-2 mt-2">
        <AccentColorPicker accentColor={accentColor} onAccentChange={setAccentColor} />
      </div>

    </div>
  );
}
