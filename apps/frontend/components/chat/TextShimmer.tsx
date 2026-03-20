
import { memo, useEffect, useRef, useState } from 'react';

type TextShimmerProps = {
  text: string;
  active?: boolean;
  offset?: number;
  className?: string;
};

export const TextShimmer = memo(function TextShimmer({
  text,
  active = true,
  offset = 0,
  className,
}: TextShimmerProps) {
  const [run, setRun] = useState(active);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (active) {
      setRun(true);
      return;
    }

    // Graceful deactivation — keep shimmer visible briefly
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setRun(false);
    }, 220);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [active]);

  return (
    <span
      data-component="text-shimmer"
      data-active={active ? 'true' : 'false'}
      className={className}
      aria-label={text}
      style={
        {
          '--text-shimmer-swap': '220ms',
          '--text-shimmer-index': `${offset}`,
        } as React.CSSProperties
      }
    >
      <span data-slot="text-shimmer-char">
        <span data-slot="text-shimmer-char-base" aria-hidden="true">
          {text}
        </span>
        <span
          data-slot="text-shimmer-char-shimmer"
          data-run={run ? 'true' : 'false'}
          aria-hidden="true"
        >
          {text}
        </span>
      </span>
    </span>
  );
});
