
import { useState, useRef, useCallback, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Color conversion helpers ──

function hslToHsv(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return [h, sv * 100, v * 100];
}

function hsvToHsl(h: number, s: number, v: number): [number, number, number] {
  s /= 100;
  v /= 100;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return [h, Math.round(sl * 100), Math.round(l * 100)];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  s /= 100;
  v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Parse stored "h s l" string into HSV */
function parseAccentToHsv(accent: string): [number, number, number] {
  if (!accent) return hslToHsv(258, 88, 66); // default purple
  const parts = accent.split(' ').map(Number);
  if (parts.length !== 3) return hslToHsv(258, 88, 66);
  return hslToHsv(parts[0], parts[1], parts[2]);
}

const DEFAULT_HSL = '258 88 66';

// ── Preset swatches ──

const ACCENT_PRESETS = [
  { label: 'Purple', value: '', preview: 'hsl(258 88% 66%)' },
  { label: 'Blue', value: '213 100 50', preview: 'hsl(213 100% 50%)' },
  { label: 'Cyan', value: '180 100 37', preview: 'hsl(180 100% 37%)' },
  { label: 'Green', value: '145 91 38', preview: 'hsl(145 91% 38%)' },
  { label: 'Yellow', value: '45 100 44', preview: 'hsl(45 100% 44%)' },
  { label: 'Orange', value: '27 100 46', preview: 'hsl(27 100% 46%)' },
  { label: 'Red', value: '355 82 56', preview: 'hsl(355 82% 56%)' },
  { label: 'Pink', value: '330 67 52', preview: 'hsl(330 67% 52%)' },
] as const;

// ── Components ──

interface AccentColorPickerProps {
  accentColor: string;
  onAccentChange: (value: string) => void;
}

export function AccentColorPicker({ accentColor, onAccentChange }: AccentColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hsv, setHsv] = useState<[number, number, number]>(() => parseAccentToHsv(accentColor));

  useEffect(() => {
    setHsv(parseAccentToHsv(accentColor));
  }, [accentColor]);

  const commitColor = useCallback((h: number, s: number, v: number) => {
    const [hh, ss, ll] = hsvToHsl(h, s, v);
    const value = `${hh} ${ss} ${ll}`;
    onAccentChange(value === DEFAULT_HSL ? '' : value);
  }, [onAccentChange]);

  const handlePreset = useCallback((value: string) => {
    onAccentChange(value);
    setHsv(parseAccentToHsv(value));
  }, [onAccentChange]);

  const handleReset = useCallback(() => {
    onAccentChange('');
    setHsv(parseAccentToHsv(''));
  }, [onAccentChange]);

  const [r, g, b] = hsvToRgb(hsv[0], hsv[1], hsv[2]);
  const currentCss = `rgb(${r}, ${g}, ${b})`;

  return (
    <div className="flex flex-col gap-3">
      {/* Row: label area is handled by parent, this is the toggle + swatch */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Accent color</div>
          <div className="text-xs text-foreground-muted mt-0.5">Choose the accent color used throughout the app.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            title="Reset to default"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className={cn(
              'w-5 h-5 rounded-full border-2 transition-all',
              isOpen ? 'border-foreground' : 'border-[var(--overlay-20)] hover:border-foreground-muted'
            )}
            style={{ backgroundColor: currentCss }}
            title="Pick accent color"
          />
        </div>
      </div>

      {/* Inline expanded picker */}
      {isOpen && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          {/* Saturation-Value area */}
          <SatValArea
            hue={hsv[0]}
            sat={hsv[1]}
            val={hsv[2]}
            onChange={(s, v) => {
              const next: [number, number, number] = [hsv[0], s, v];
              setHsv(next);
              commitColor(next[0], next[1], next[2]);
            }}
          />

          {/* Hue slider */}
          <HueSlider
            hue={hsv[0]}
            onChange={(h) => {
              const next: [number, number, number] = [h, hsv[1], hsv[2]];
              setHsv(next);
              commitColor(next[0], next[1], next[2]);
            }}
          />

          {/* Preset swatches */}
          <div className="flex gap-1.5 flex-wrap">
            {ACCENT_PRESETS.map((preset) => {
              const isActive = accentColor === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset.value)}
                  className={cn(
                    'w-5 h-5 rounded-full border transition-all',
                    isActive ? 'border-foreground scale-110' : 'border-transparent hover:scale-110'
                  )}
                  style={{ backgroundColor: preset.preview }}
                  title={preset.label}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Saturation-Value gradient area ──

function SatValArea({ hue, sat, val, onChange }: { hue: number; sat: number; val: number; onChange: (s: number, v: number) => void }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onChange(Math.round(x * 100), Math.round((1 - y) * 100));
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    update(e);
  }, [update]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    update(e);
  }, [update]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={areaRef}
      className="relative w-full h-[150px] rounded-md cursor-crosshair overflow-hidden"
      style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, #000)' }} />
      <div
        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          left: `${sat}%`,
          top: `${100 - val}%`,
        }}
      />
    </div>
  );
}

// ── Hue slider ──

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback((e: { clientX: number }) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onChange(Math.round(x * 360));
  }, [onChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    update(e);
  }, [update]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    update(e);
  }, [update]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      ref={trackRef}
      className="relative w-full h-3 rounded-full cursor-pointer"
      style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)] -translate-x-1/2 -translate-y-1/2 pointer-events-none top-1/2"
        style={{ left: `${(hue / 360) * 100}%` }}
      />
    </div>
  );
}
