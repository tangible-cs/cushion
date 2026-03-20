
import { useAppearanceStore } from '@/stores/appearanceStore';
import { cn } from '@/lib/utils';

interface AppearanceSettingsProps {
  embedded?: boolean;
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

/** HSL accent presets — stored as "h s l" (no % signs in storage, added on apply) */
const ACCENT_PRESETS = [
  { label: 'Purple', value: '258 88 66', preview: 'hsl(258 88% 66%)' },
  { label: 'Blue', value: '213 100 50', preview: 'hsl(213 100% 50%)' },
  { label: 'Cyan', value: '180 100 37', preview: 'hsl(180 100% 37%)' },
  { label: 'Green', value: '145 91 38', preview: 'hsl(145 91% 38%)' },
  { label: 'Yellow', value: '45 100 44', preview: 'hsl(45 100% 44%)' },
  { label: 'Orange', value: '27 100 46', preview: 'hsl(27 100% 46%)' },
  { label: 'Red', value: '355 82 56', preview: 'hsl(355 82% 56%)' },
  { label: 'Pink', value: '330 67 52', preview: 'hsl(330 67% 52%)' },
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
        <div className="text-sm font-medium mb-2">Accent color</div>
        <div className="flex flex-wrap gap-2">
          {ACCENT_PRESETS.map((preset) => {
            const isActive = accentColor === preset.value || (!accentColor && preset.label === 'Purple');
            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => setAccentColor(preset.label === 'Purple' ? '' : preset.value)}
                className={cn(
                  'w-7 h-7 rounded-full border-2 transition-all',
                  isActive
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105'
                )}
                style={{ backgroundColor: preset.preview }}
                title={preset.label}
              />
            );
          })}
        </div>
      </div>

    </div>
  );
}
