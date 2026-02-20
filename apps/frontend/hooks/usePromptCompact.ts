import { useCallback, useEffect, useRef, useState } from 'react';

export const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3] as const;
export const COMPACT_LEVEL_MAX = COMPACT_LABEL_LENGTHS.length - 1;
const COMPACT_STEP_RATIO = 0.16;
const COMPACT_STEP_MIN = 56;

export const VARIANT_SIZE_CLASSES = [
  'max-w-[160px] px-2.5',
  'max-w-[16ch] px-2.5',
  'max-w-[12ch] px-2',
  'max-w-[7ch] px-2',
] as const;

export function resolveCompactLevel(overflow: number, fullWidth: number): number {
  if (overflow <= 0 || fullWidth <= 0) return 0;
  const step = Math.max(COMPACT_STEP_MIN, Math.round(fullWidth * COMPACT_STEP_RATIO));
  if (overflow <= step * 0.5) return 0;
  if (overflow <= step * 1.2) return 1;
  if (overflow <= step * 2) return 2;
  return Math.min(3, COMPACT_LEVEL_MAX);
}

export function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

type UsePromptCompactOptions = {
  shellMode: boolean;
  deps: unknown[];
};

export function usePromptCompact({ shellMode, deps }: UsePromptCompactOptions) {
  const [compactLevel, setCompactLevel] = useState(0);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const leftControlsRef = useRef<HTMLDivElement | null>(null);
  const rightControlsRef = useRef<HTMLDivElement | null>(null);
  const fullLeftWidthRef = useRef(0);

  const updateFooterCompact = useCallback(() => {
    if (shellMode) return;
    const footer = footerRef.current;
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!footer || !left || !right) return;
    const footerWidth = footer.getBoundingClientRect().width;
    const rightWidth = right.getBoundingClientRect().width;
    const available = footerWidth - rightWidth - 12;
    const measuredLeftWidth = left.scrollWidth;
    if (fullLeftWidthRef.current === 0) {
      fullLeftWidthRef.current = measuredLeftWidth;
    }
    const fullLeftWidth = fullLeftWidthRef.current || measuredLeftWidth;
    const overflow = fullLeftWidth - available;
    const nextLevel = resolveCompactLevel(overflow, fullLeftWidth);
    setCompactLevel((prev) => (prev === nextLevel ? prev : nextLevel));
  }, [shellMode]);

  // Reset full width measurement when deps change at compact level 0
  useEffect(() => {
    if (shellMode || compactLevel > 0) return;
    const left = leftControlsRef.current;
    if (!left) return;
    fullLeftWidthRef.current = left.scrollWidth;
    updateFooterCompact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellMode, compactLevel, ...deps, updateFooterCompact]);

  // ResizeObserver for responsive compact
  useEffect(() => {
    updateFooterCompact();
    const footer = footerRef.current;
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!footer || !left || !right) return;
    const observer = new ResizeObserver(updateFooterCompact);
    observer.observe(footer);
    observer.observe(left);
    observer.observe(right);
    return () => observer.disconnect();
  }, [updateFooterCompact]);

  return { compactLevel, footerRef, leftControlsRef, rightControlsRef };
}
