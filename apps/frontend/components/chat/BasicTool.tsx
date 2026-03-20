
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, type AnimationPlaybackControls } from 'motion';
import { Collapsible } from './Collapsible';
import { Icon, type IconName } from './Icon';
import { TextShimmer } from './TextShimmer';
import { prefersReducedMotion } from './message-helpers';

export type TriggerTitle = {
  title: string;
  subtitle?: string;
  args?: string[];
  action?: ReactNode;
};

export function isTriggerTitle(val: unknown): val is TriggerTitle {
  return (
    typeof val === 'object' &&
    val !== null &&
    'title' in val &&
    typeof (val as TriggerTitle).title === 'string'
  );
}

export interface BasicToolProps {
  icon: IconName;
  trigger: TriggerTitle | ReactNode;
  children?: ReactNode;
  status?: string;
  hideDetails?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  defer?: boolean;
  locked?: boolean;
  animated?: boolean;
  className?: string;
}

const SPRING = { type: 'spring' as const, visualDuration: 0.35, bounce: 0 };

export const BasicTool = memo(function BasicTool({
  icon,
  trigger,
  children,
  status,
  hideDetails,
  defaultOpen = false,
  forceOpen,
  defer,
  locked,
  animated = true,
  className,
}: BasicToolProps) {
  const pending = status === 'pending' || status === 'running';
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(!defer || defaultOpen);

  const contentRef = useRef<HTMLDivElement>(null);
  const heightAnim = useRef<AnimationPlaybackControls | null>(null);
  const initialOpen = useRef(defaultOpen);
  const isFirstRender = useRef(true);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (!defer) return;
    if (open) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        setReady(true);
      });
    } else {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setReady(false);
    }
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [open, defer]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!animated) return;
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
    return () => { heightAnim.current?.stop(); };
  }, [open, animated]);

  const handleOpenChange = (value: boolean) => {
    if (pending) return;
    if (locked && !value) return;
    setOpen(value);
  };

  const hasDetails = !!children && !hideDetails;
  const showArrow = hasDetails && !locked && !pending;

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <Collapsible.Trigger>
        <div data-component="tool-trigger" className={className}>
          <div data-slot="basic-tool-tool-trigger-content">
            {isTriggerTitle(trigger) ? (
              <>
                <Icon name={icon} size="small" />
                <div data-slot="basic-tool-tool-info">
                  <div data-slot="basic-tool-tool-info-structured">
                    <div data-slot="basic-tool-tool-info-main">
                      <span data-slot="basic-tool-tool-title">
                        <TextShimmer text={trigger.title} active={pending} />
                      </span>
                      {!pending && trigger.subtitle && (
                        <span data-slot="basic-tool-tool-subtitle">{trigger.subtitle}</span>
                      )}
                      {!pending && trigger.args?.map((arg, i) => (
                        <span key={i} data-slot="basic-tool-tool-arg">{arg}</span>
                      ))}
                    </div>
                    {!pending && trigger.action}
                  </div>
                </div>
              </>
            ) : (
              trigger
            )}
          </div>
          {showArrow && <Collapsible.Arrow />}
        </div>
      </Collapsible.Trigger>

      {animated && hasDetails && (
        <div
          ref={contentRef}
          data-slot="collapsible-content"
          data-animated
          style={{
            height: initialOpen.current ? 'auto' : '0px',
            overflow: initialOpen.current ? 'visible' : 'hidden',
          }}
        >
          {(!defer || ready) && children}
        </div>
      )}
      {!animated && hasDetails && (
        <Collapsible.Content>
          {(!defer || ready) && children}
        </Collapsible.Content>
      )}
    </Collapsible>
  );
});
