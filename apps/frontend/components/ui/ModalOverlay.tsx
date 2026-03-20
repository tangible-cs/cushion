
import { useCallback, type ReactNode, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';

type MaxWidth = '5xl' | '6xl';

const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

type ModalOverlayProps = {
  children: ReactNode;
  maxWidth?: MaxWidth;
  onBackdropClick?: () => void;
  className?: string;
};

export function ModalOverlay({
  children,
  maxWidth = '6xl',
  onBackdropClick,
  className,
}: ModalOverlayProps) {
  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if (e.target === e.currentTarget && onBackdropClick) {
        onBackdropClick();
      }
    },
    [onBackdropClick]
  );

  return (
    <div
      className="fixed inset-0 z-modal bg-[var(--overlay-50)] flex items-center justify-center p-8"
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          'w-full h-full max-h-[90vh] bg-modal-bg rounded-xl overflow-hidden shadow-[var(--shadow-lg)] border border-modal-border',
          MAX_WIDTH_CLASSES[maxWidth],
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
