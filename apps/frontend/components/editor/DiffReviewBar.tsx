
import { useDiffReviewStore } from '@/stores/diffReviewStore';

interface DiffReviewBarProps {
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onExitReview: () => void;
}

export function DiffReviewBar({ onAcceptAll, onRejectAll, onExitReview }: DiffReviewBarProps) {
  const chunkCount = useDiffReviewStore((s) => s.chunkCount);
  const reviewingFilePath = useDiffReviewStore((s) => s.reviewingFilePath);

  if (!reviewingFilePath) return null;

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 text-xs flex-shrink-0"
      style={{
        backgroundColor: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        color: 'var(--foreground)',
      }}
    >
      <span style={{ color: 'var(--foreground-muted)' }}>
        {chunkCount} {chunkCount === 1 ? 'change' : 'changes'} remaining
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onRejectAll}
          className="diff-btn-reject px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
        >
          Reject All (Esc)
        </button>
        <button
          onClick={onExitReview}
          className="diff-btn-exit px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
        >
          Exit Review
        </button>
        <button
          onClick={onAcceptAll}
          className="diff-btn-accept px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
        >
          Accept All ({navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter)
        </button>
      </div>
    </div>
  );
}
