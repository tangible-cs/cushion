
import { memo, useEffect, useRef } from 'react';
import { animate } from 'motion';

interface ShellSubmessageProps {
  text: string;
  animated?: boolean;
}

export const ShellSubmessage = memo(function ShellSubmessage({
  text,
  animated = true,
}: ShellSubmessageProps) {
  const widthRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!animated) return;
    const frame = requestAnimationFrame(() => {
      if (widthRef.current) {
        animate(
          widthRef.current,
          { width: 'auto' },
          { type: 'spring', visualDuration: 0.25, bounce: 0 },
        );
      }
      if (valueRef.current) {
        animate(
          valueRef.current,
          { opacity: 1, filter: 'blur(0px)' },
          { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span data-component="shell-submessage">
      <span
        ref={widthRef}
        data-slot="shell-submessage-width"
        style={animated ? { width: '0px' } : undefined}
      >
        <span data-slot="basic-tool-tool-subtitle">
          <span
            ref={valueRef}
            data-slot="shell-submessage-value"
            style={animated ? { opacity: 0, filter: 'blur(2px)' } : undefined}
          >
            {text}
          </span>
        </span>
      </span>
    </span>
  );
});
