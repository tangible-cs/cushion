
import { memo } from 'react';
import { AnimatedCountLabel } from './AnimatedCountLabel';

export type CountItem = {
  key: string;
  count: number;
  one: string;
  other: string;
};

export const AnimatedCountList = memo(function AnimatedCountList({
  items,
  fallback = '',
  className,
}: {
  items: CountItem[];
  fallback?: string;
  className?: string;
}) {
  const showEmpty = items.every((item) => item.count <= 0) && fallback.length > 0;

  return (
    <span data-component="tool-count-summary" className={className}>
      <span data-slot="tool-count-summary-empty" data-active={showEmpty ? 'true' : 'false'}>
        <span data-slot="tool-count-summary-empty-inner">{fallback}</span>
      </span>

      {items.map((item, index) => {
        const active = item.count > 0;
        let hasPrev = false;
        for (let i = index - 1; i >= 0; i--) {
          if (items[i].count > 0) { hasPrev = true; break; }
        }

        return (
          <span key={item.key}>
            <span data-slot="tool-count-summary-prefix" data-active={active && hasPrev ? 'true' : 'false'}>
              ,
            </span>
            <span data-slot="tool-count-summary-item" data-active={active ? 'true' : 'false'}>
              <span data-slot="tool-count-summary-item-inner">
                <AnimatedCountLabel
                  one={item.one}
                  other={item.other}
                  count={Math.max(0, Math.round(item.count))}
                />
              </span>
            </span>
          </span>
        );
      })}
    </span>
  );
});
