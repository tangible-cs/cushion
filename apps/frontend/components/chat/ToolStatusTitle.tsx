
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TextShimmer } from './TextShimmer';

function commonPrefix(active: string, done: string) {
  const a = Array.from(active);
  const b = Array.from(done);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return {
    prefix: a.slice(0, i).join(''),
    active: a.slice(i).join(''),
    done: b.slice(i).join(''),
  };
}

function contentWidth(el: HTMLSpanElement | null) {
  if (!el) return 0;
  const range = document.createRange();
  range.selectNodeContents(el);
  return Math.ceil(range.getBoundingClientRect().width);
}

export const ToolStatusTitle = memo(function ToolStatusTitle({
  active,
  activeText,
  doneText,
  split: splitProp = true,
  className,
}: {
  active: boolean;
  activeText: string;
  doneText: string;
  split?: boolean;
  className?: string;
}) {
  const s = useMemo(() => commonPrefix(activeText, doneText), [activeText, doneText]);
  const useSuffix = splitProp && s.prefix.length >= 2 && s.active.length > 0 && s.done.length > 0;
  const prefixLen = Array.from(s.prefix).length;
  const activeTail = useSuffix ? s.active : activeText;
  const doneTail = useSuffix ? s.done : doneText;

  const activeRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState('auto');
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const target = active ? activeRef.current : doneRef.current;
    const px = contentWidth(target);
    if (px > 0) setWidth(`${px}px`);
  }, [active]);

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [active, activeTail, doneTail, useSuffix, measure]);

  useEffect(() => {
    measure();
    document.fonts?.ready.finally(() => {
      measure();
      requestAnimationFrame(() => setReady(true));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const label = active ? activeText : doneText;

  return (
    <span
      data-component="tool-status-title"
      data-active={active ? 'true' : 'false'}
      data-ready={ready ? 'true' : 'false'}
      data-mode={useSuffix ? 'suffix' : 'swap'}
      className={className}
      aria-label={label}
    >
      {useSuffix ? (
        <span data-slot="tool-status-suffix">
          <span data-slot="tool-status-prefix">
            <TextShimmer text={s.prefix} active={active} offset={0} />
          </span>
          <span data-slot="tool-status-tail" style={{ width }}>
            <span data-slot="tool-status-active" ref={activeRef}>
              <TextShimmer text={activeTail} active={active} offset={prefixLen} />
            </span>
            <span data-slot="tool-status-done" ref={doneRef}>
              <TextShimmer text={doneTail} active={false} offset={prefixLen} />
            </span>
          </span>
        </span>
      ) : (
        <span data-slot="tool-status-swap" style={{ width }}>
          <span data-slot="tool-status-active" ref={activeRef}>
            <TextShimmer text={activeTail} active={active} offset={0} />
          </span>
          <span data-slot="tool-status-done" ref={doneRef}>
            <TextShimmer text={doneTail} active={false} offset={0} />
          </span>
        </span>
      )}
    </span>
  );
});
