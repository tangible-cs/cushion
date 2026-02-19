'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Trash2, Files, X } from 'lucide-react';
import { useOverlayClose } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  shortcut?: string;
  variant?: 'default' | 'danger';
  onClick: () => void;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
}

export function ContextMenu({ items, isOpen, onClose, position }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    // Adjust position to keep menu in viewport
    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position
    if (x + rect.width > viewportWidth) {
      x = viewportWidth - rect.width - 8;
    }

    // Adjust vertical position
    if (y + rect.height > viewportHeight) {
      y = viewportHeight - rect.height - 8;
    }

    setAdjustedPosition({ x, y });
  }, [isOpen, position]);

  // Close on Escape shortcut and click-outside (US-A4)
  useOverlayClose({
    isOpen,
    onClose,
    insideRefs: [menuRef],
  });

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      className="z-context-menu bg-surface border border-border rounded-lg shadow-md p-1 min-w-[220px] animate-menu-fade-in"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {item.separator && index > 0 && <div className="h-px bg-border my-1" />}
          <div
            className={cn(
              "flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors text-sm select-none",
              item.variant === "danger"
                ? "text-accent-red hover:bg-[color-mix(in_srgb,var(--accent-red)_12%,var(--surface))]"
                : "text-foreground hover:bg-[var(--overlay-10)]"
            )}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            <div className="flex items-center gap-2 flex-1">
              {item.icon && (
                <div className="flex items-center justify-center w-4 h-4 shrink-0">
                  <item.icon size={16} />
                </div>
              )}
              <div className="flex-1">{item.label}</div>
            </div>
            {item.shortcut && (
              <div className="text-xs text-foreground-subtle font-mono ml-3">
                {item.shortcut}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
