
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
  return (
    <div data-slot="collapsible-arrow" className={className}>
      <div data-slot="collapsible-arrow-icon">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
        >
          <path
            d="M2.5 3.5L5 6.5L7.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

export const Collapsible = Object.assign(CollapsibleRoot, {
  Trigger: CollapsibleTrigger,
  Content: CollapsibleContent,
  Arrow: CollapsibleArrow,
});
