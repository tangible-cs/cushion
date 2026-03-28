import { useEffect, useState } from 'react';
import { useDictationStore } from '@/stores/dictationStore';

export function RecordingOverlay() {
  const status = useDictationStore((s) => s.status);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== 'recording') {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (status !== 'recording') return null;

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-red-12)] text-[var(--accent-red)] text-xs font-mono pointer-events-none">
      <span className="size-2 rounded-full bg-current animate-pulse" />
      {minutes}:{seconds}
    </div>
  );
}
