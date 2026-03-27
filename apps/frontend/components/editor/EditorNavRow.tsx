
import { Fragment, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ScanEye, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useExplorerStore } from '@/stores/explorerStore';
import type { BreadcrumbSegment } from './editor-path';

interface EditorNavRowProps {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  onShare?: () => void;
  segments: BreadcrumbSegment[];
  centerTitle?: string;
}

const MAX_VISIBLE_SEGMENTS = 3;

export function EditorNavRow({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  focusModeEnabled,
  onToggleFocusMode,
  onShare,
  segments,
  centerTitle,
}: EditorNavRowProps) {
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

      <div className="min-w-0 flex justify-center" title={centerTitle}>
        <BreadcrumbNav segments={segments} />
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
            <ScanEye size={18} />
          </button>
        )}

        <button
          onClick={onShare}
          className={cn(
            'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-muted/40',
            'transition-colors duration-150'
          )}
          title="Share"
        >
          <Share2 size={18} />
        </button>
      </div>
    </div>
  );
}

function BreadcrumbNav({ segments }: { segments: BreadcrumbSegment[] }) {
  const revealInExplorer = useExplorerStore((s) => s.revealInExplorer);

  const handleClick = useCallback(
    (dirPath: string | null) => {
      if (dirPath) revealInExplorer(dirPath);
    },
    [revealInExplorer],
  );

  if (segments.length === 0) {
    return (
      <span className="text-sm text-muted-foreground truncate">
        No file selected
      </span>
    );
  }

  const needsCollapse = segments.length > MAX_VISIBLE_SEGMENTS;
  const first = segments[0];
  const collapsed = needsCollapse ? segments.slice(1, -2) : [];
  const tail = needsCollapse ? segments.slice(-2) : segments.slice(1);

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap text-sm">
        <BreadcrumbItem className="truncate">
          {tail.length === 0 && !needsCollapse ? (
            <BreadcrumbPage className="truncate">{first.label}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              className={cn('truncate', first.dirPath ? 'cursor-pointer' : 'cursor-default')}
              onClick={() => handleClick(first.dirPath)}
            >
              {first.label}
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>

        {needsCollapse && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1 rounded hover:bg-muted/40 transition-colors">
                  <BreadcrumbEllipsis />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {collapsed.map((seg, i) => (
                      <DropdownMenuItem
                        key={i}
                        onClick={() => handleClick(seg.dirPath)}
                      >
                        {seg.label}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        )}

        {tail.map((seg, i) => (
          <Fragment key={i}>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="truncate">
              {i === tail.length - 1 ? (
                <BreadcrumbPage className="truncate">{seg.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  className={cn('truncate', seg.dirPath ? 'cursor-pointer' : 'cursor-default')}
                  onClick={() => handleClick(seg.dirPath)}
                >
                  {seg.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
