'use client';

import { useEffect, useRef, useState } from 'react';
import { Copy, Pencil, Trash2, Files, X } from 'lucide-react';
import { useOverlayClose } from '@/lib/shortcuts';

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
        zIndex: 10000,
      }}
      className="context-menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <style jsx>{`
        .context-menu {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 4px;
          min-width: 220px;
          animation: menuFadeIn 0.15s ease-out;
        }

        @keyframes menuFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .menu-separator {
          height: 1px;
          background: rgba(0, 0, 0, 0.1);
          margin: 4px 0;
        }

        .menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s;
          font-size: 14px;
          color: rgba(0, 0, 0, 0.8);
          user-select: none;
        }

        .menu-item:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .menu-item.danger {
          color: #dc2626;
        }

        .menu-item.danger:hover {
          background: rgba(220, 38, 38, 0.1);
        }

        .menu-item-content {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .menu-item-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .menu-item-label {
          flex: 1;
        }

        .menu-item-shortcut {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.4);
          font-family: monospace;
          margin-left: 12px;
        }
      `}</style>

      {items.map((item, index) => (
        <div key={item.id}>
          {item.separator && index > 0 && <div className="menu-separator" />}
          <div
            className={`menu-item ${item.variant === 'danger' ? 'danger' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              item.onClick();
              onClose();
            }}
            role="menuitem"
          >
            <div className="menu-item-content">
              {item.icon && (
                <div className="menu-item-icon">
                  <item.icon size={16} />
                </div>
              )}
              <div className="menu-item-label">{item.label}</div>
            </div>
            {item.shortcut && (
              <div className="menu-item-shortcut">{item.shortcut}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
