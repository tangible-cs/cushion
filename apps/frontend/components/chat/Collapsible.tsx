'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface CollapsibleContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleContextValue | undefined>(undefined);

function useCollapsible() {
  const context = useContext(CollapsibleContext);
  if (!context) {
    throw new Error('Collapsible components must be used within a Collapsible.Root');
  }
  return context;
}

interface CollapsibleRootProps {
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function CollapsibleRoot({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: CollapsibleRootProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  const toggle = () => setOpen(!open);

  return (
    <CollapsibleContext.Provider value={{ open, setOpen, toggle }}>
      <div data-component="collapsible">{children}</div>
    </CollapsibleContext.Provider>
  );
}

interface CollapsibleTriggerProps {
  children: ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

function CollapsibleTrigger({ children, className, onClick }: CollapsibleTriggerProps) {
  const { open, toggle } = useCollapsible();

  const handleClick = (e: React.MouseEvent) => {
    onClick?.(e);
    toggle();
  };

  return (
    <button
      type="button"
      data-slot="collapsible-trigger"
      className={className}
      onClick={handleClick}
      aria-expanded={open}
    >
      {children}
    </button>
  );
}

interface CollapsibleContentProps {
  children: ReactNode;
  className?: string;
}

function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const { open } = useCollapsible();

  if (!open) return null;

  return (
    <div data-slot="collapsible-content" className={className}>
      {children}
    </div>
  );
}

interface CollapsibleArrowProps {
  className?: string;
}

function CollapsibleArrow({ className }: CollapsibleArrowProps) {
  const { open } = useCollapsible();

  return (
    <div data-slot="collapsible-arrow" className={className}>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        className={`transition-transform ${open ? 'rotate-180' : ''}`}
      >
        <path
          d="M6.66675 7.49984L10.0001 4.1665L13.3334 7.49984M6.66675 12.4998L10.0001 15.8332L13.3334 12.4998"
          transform={open ? 'translate(0, -5)' : 'translate(0, -5)'}
          stroke="currentColor"
          strokeLinecap="square"
        />
        <path
          d="M6.66675 2.49984L10.0001 5.83317L13.3334 2.49984M6.66675 7.49984L10.0001 10.8332L13.3334 7.49984"
          transform="translate(0, -2)"
          stroke="currentColor"
          strokeLinecap="square"
        />
      </svg>
    </div>
  );
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
  Arrow: CollapsibleArrow,
});