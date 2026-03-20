
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Share2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorNavRowProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  centerContent?: ReactNode;
  centerTitle?: string;
}

export function EditorNavRow({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  focusModeEnabled,
  onToggleFocusMode,
  centerContent,
  centerTitle,
}: EditorNavRowProps) {
  const resolvedCenterTitle =
    centerTitle ?? (typeof centerContent === 'string' ? centerContent : undefined);

  return (
    <div className="grid h-9 grid-cols-[minmax(72px,1fr),minmax(0,2fr),minmax(72px,1fr)] items-center gap-2 border-b border-transparent bg-background px-2 flex-shrink-0">
      <div className="min-w-0 flex items-center justify-start">
        <button
          onClick={onGoBack}
          disabled={!canGoBack}
          className={cn(
            'h-8 w-8 rounded flex items-center justify-center transition-colors duration-150',
            canGoBack
              ? 'text-muted-foreground hover:text-foreground'
              : 'text-muted-foreground/30 cursor-default'
          )}
          title="Go back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={onGoForward}
          disabled={!canGoForward}
          className={cn(
            'h-8 w-8 rounded flex items-center justify-center transition-colors duration-150',
            canGoForward
              ? 'text-muted-foreground hover:text-foreground'
              : 'text-muted-foreground/30 cursor-default'
          )}
          title="Go forward"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="min-w-0 px-1">
        <div
          className="h-5 truncate text-center text-sm text-muted-foreground"
          title={resolvedCenterTitle}
        >
          {centerContent}
        </div>
      </div>

      <div className="min-w-0 flex items-center justify-end gap-1">
        {onToggleFocusMode && (
          <button
            onClick={onToggleFocusMode}
            className={cn(
              'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded',
              focusModeEnabled ? 'text-foreground' : 'text-muted-foreground',
              'hover:text-foreground',
              focusModeEnabled
                ? 'bg-muted/40'
                : 'hover:bg-muted/40',
              'transition-colors duration-150'
            )}
            title={focusModeEnabled ? 'Exit focus mode' : 'Enter focus mode'}
            aria-pressed={!!focusModeEnabled}
          >
            <Target size={16} />
          </button>
        )}

        <button
          className={cn(
            'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/40',
            'transition-colors duration-150'
          )}
          title="Share"
        >
          <Share2 size={16} />
        </button>
      </div>
    </div>
  );
}
