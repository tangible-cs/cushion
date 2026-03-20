
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { prefersReducedMotion } from './message-helpers';

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

const SPRING = { type: 'spring' as const, visualDuration: 0.35, bounce: 0 };

interface AnimatedCollapsibleContentProps {
  children: ReactNode;
  className?: string;
  defer?: boolean;
}

function AnimatedCollapsibleContent({
  children,
  className,
  defer,
}: AnimatedCollapsibleContentProps) {
  const { open } = useCollapsible();
  const contentRef = useRef<HTMLDivElement>(null);
  const heightAnim = useRef<AnimationPlaybackControls | null>(null);
  const initialOpen = useRef(open);
  const isFirstRender = useRef(true);
  const [ready, setReady] = useState(!defer || open);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!defer) return;

    if (open) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setReady(true);
      });
    } else {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      setReady(false);
    }

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [open, defer]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const el = contentRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.height = open ? 'auto' : '0px';
      el.style.overflow = open ? 'visible' : 'hidden';
      return;
    }

    heightAnim.current?.stop();

    if (open) {
      el.style.overflow = 'hidden';
      heightAnim.current = animate(el, { height: 'auto' }, SPRING);
      heightAnim.current.finished.then(() => {
        if (!contentRef.current) return;
        contentRef.current.style.overflow = 'visible';
        contentRef.current.style.height = 'auto';
      });
    } else {
      el.style.overflow = 'hidden';
      heightAnim.current = animate(el, { height: '0px' }, SPRING);
    }

    return () => {
      heightAnim.current?.stop();
    };
  }, [open]);

  return (
    <div
      ref={contentRef}
      data-slot="collapsible-content"
      data-animated
      className={className}
      style={{
        height: initialOpen.current ? 'auto' : '0px',
        overflow: initialOpen.current ? 'visible' : 'hidden',
      }}
    >
      {(!defer || ready) && children}
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
  AnimatedContent: AnimatedCollapsibleContent,
  Arrow: CollapsibleArrow,
});
