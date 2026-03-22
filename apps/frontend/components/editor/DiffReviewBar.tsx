
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
          className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--accent-red-12)',
            color: 'var(--accent-red)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-red)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-red-12)';
            e.currentTarget.style.color = 'var(--accent-red)';
          }}
        >
          Reject All (Esc)
        </button>
        <button
          onClick={onExitReview}
          className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--surface-hover)',
            color: 'var(--foreground-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--foreground)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
            e.currentTarget.style.color = 'var(--foreground-muted)';
          }}
        >
          Exit Review
        </button>
        <button
          onClick={onAcceptAll}
          className="px-2 py-0.5 rounded text-xs cursor-pointer transition-colors"
          style={{
            backgroundColor: 'var(--accent-green-12)',
            color: 'var(--accent-green)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-green)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--accent-green-12)';
            e.currentTarget.style.color = 'var(--accent-green)';
          }}
        >
          Accept All ({navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'}+Enter)
        </button>
      </div>
    </div>
  );
}
