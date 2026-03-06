'use client';

import { useState } from 'react';
import { Keyboard, Palette, Settings as SettingsIcon, SlidersHorizontal, X } from 'lucide-react';
import { ShortcutsSettings } from './ShortcutsSettings';
import { ConfigSettings } from './ConfigSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { cn } from '@/lib/utils';

interface SettingsPanelProps {
  onClose?: () => void;
}

const sections = [
  { id: 'config', label: 'Config', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
] as const;

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]['id']>('config');

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <SettingsIcon size={16} className="text-foreground-muted" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            aria-label="Close settings"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex">
        <aside className="w-42 border-r border-border p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                activeSection === section.id
                  ? 'bg-[var(--overlay-10)] text-foreground'
                  : 'text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)]'
              )}
            >
              <section.icon size={16} />
              {section.label}
            </button>
          ))}
        </aside>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          {activeSection === 'config' && <ConfigSettings />}
          {activeSection === 'appearance' && <AppearanceSettings />}
          {activeSection === 'shortcuts' && <ShortcutsSettings />}
        </section>
      </div>
    </div>
  );
}
