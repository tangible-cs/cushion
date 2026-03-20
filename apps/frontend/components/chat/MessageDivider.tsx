
import { memo } from 'react';

interface MessageDividerProps {
  label: string;
}

export const MessageDivider = memo(function MessageDivider({ label }: MessageDividerProps) {
  return (
    <div data-component="compaction-part">
      <div data-slot="compaction-part-divider">
        <span data-slot="compaction-part-line" />
        <span data-slot="compaction-part-label">{label}</span>
        <span data-slot="compaction-part-line" />
      </div>
    </div>
  );
});
