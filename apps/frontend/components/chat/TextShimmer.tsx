'use client';

import { memo, useMemo } from 'react';

type TextShimmerProps = {
  text: string;
  active?: boolean;
  stepMs?: number;
  durationMs?: number;
  className?: string;
};

export const TextShimmer = memo(function TextShimmer({
  text,
  active = true,
  stepMs = 45,
  durationMs = 1200,
  className,
}: TextShimmerProps) {
  const chars = useMemo(() => Array.from(text), [text]);

  return (
    <span
      data-component="text-shimmer"
      data-active={active}
      className={className}
      aria-label={text}
      style={
        {
          '--text-shimmer-step': `${stepMs}ms`,
          '--text-shimmer-duration': `${durationMs}ms`,
        } as React.CSSProperties
      }
    >
      {chars.map((char, index) => (
        <span
          key={index}
          data-slot="text-shimmer-char"
          aria-hidden="true"
          style={{ '--text-shimmer-index': `${index}` } as React.CSSProperties}
        >
          {char}
        </span>
      ))}
    </span>
  );
});
