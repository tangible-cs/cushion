
import { createContext, useContext, useEffect, useRef, useState, cloneElement, isValidElement, Children, type ReactElement, type ReactNode } from 'react';
import * as React from 'react';
import { useOverlayClose } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

type PopoverContextValue = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  minWidth: number;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopover() {
  const context = useContext(PopoverContext);
  if (!context) {
    throw new Error('usePopover must be used within a Popover');
  }
  return context;
}

export type PopoverProps = {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: 'top' | 'top-start' | 'top-end' | 'bottom' | 'bottom-start' | 'bottom-end';
  offset?: number;
  minWidth?: number;
};

export function Popover({ children, open: controlledOpen, onOpenChange, placement = 'top-start', offset = 8, minWidth = 288 }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (controlledOpen === undefined) {
      setInternalOpen(value);
    }
    onOpenChange?.(value);
  };

  // Close on Escape shortcut and click-outside (US-A4)
  useOverlayClose({
    isOpen,
    onClose: () => setIsOpen(false),
    insideRefs: [triggerRef, contentRef],
    capture: true,
  });

  return (
    <PopoverContext.Provider value={{ isOpen, setIsOpen, triggerRef, contentRef, minWidth }}>
      {children}
    </PopoverContext.Provider>
  );
}

export type PopoverTriggerProps = {
  children: ReactNode;
  asChild?: boolean;
};

export function PopoverTrigger({ children, asChild = false }: PopoverTriggerProps) {
  const { isOpen, setIsOpen, triggerRef } = usePopover();

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  if (asChild && isValidElement(children)) {
    const childProps = children.props as { onClick?: (e: React.MouseEvent) => void };
    const onClick = (e: React.MouseEvent) => {
      handleClick();
      childProps.onClick?.(e);
    };
    // React's cloneElement types don't support adding ref to arbitrary elements
    // This is a standard pattern (see Radix UI's asChild) - cast required
    return cloneElement(children, { ref: triggerRef, onClick } as React.Attributes);
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

export type PopoverContentProps = {
  children: ReactNode;
  className?: string;
};

export function PopoverContent({ children, className = '' }: PopoverContentProps) {
  const { isOpen, triggerRef, contentRef, minWidth } = usePopover();
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const trigger = triggerRef.current;
    const content = contentRef.current;
    if (!content) return;

    const triggerRect = trigger.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();

    const top = triggerRect.top - contentRect.height - 8;
    const left = triggerRect.left;
    const width = Math.max(triggerRect.width, minWidth);

    setPosition({ top, left, width });

    // Adjust if content would go off-screen
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (top < 8) {
      // Too close to top, flip to bottom
      setPosition((prev) => ({ ...prev, top: triggerRect.bottom + 8 }));
    }

    if (left + width > windowWidth - 8) {
      // Too close to right edge
      setPosition((prev) => ({ ...prev, left: windowWidth - width - 8 }));
    }

    if (left < 8) {
      // Too close to left edge
      setPosition((prev) => ({ ...prev, left: 8 }));
    }
  }, [isOpen, triggerRef, contentRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={contentRef}
      className={cn("fixed z-popover w-72 max-h-80 overflow-auto rounded-md border border-menu-border bg-menu-bg shadow-md outline-none thin-scrollbar", className)}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: `${position.width}px`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
