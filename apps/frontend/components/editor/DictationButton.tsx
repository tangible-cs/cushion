import { Mic, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDictationStore } from '@/stores/dictationStore';

export function DictationButton() {
  const status = useDictationStore((s) => s.status);
  const error = useDictationStore((s) => s.error);
  const toggleRecording = useDictationStore((s) => s.toggleRecording);

  const isDisabled = status === 'transcribing' || status === 'waiting-for-server' || status === 'post-processing';

  let icon: React.ReactNode;
  let title: string;

  switch (status) {
    case 'recording':
      icon = <Square size={14} />;
      title = 'Stop dictation';
      break;
    case 'waiting-for-server':
      icon = <Loader2 size={18} className="animate-spin" />;
      title = 'Starting dictation server...';
      break;
    case 'transcribing':
      icon = <Loader2 size={18} className="animate-spin" />;
      title = 'Transcribing...';
      break;
    case 'post-processing':
      icon = <Loader2 size={18} className="animate-spin" />;
      title = 'Cleaning up...';
      break;
    case 'error':
      icon = <Mic size={18} />;
      title = error || 'Dictation error';
      break;
    default:
      icon = <Mic size={18} />;
      title = 'Start dictation';
  }

  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggleRecording}
      disabled={isDisabled}
      className={cn(
        'h-8 w-8 flex-shrink-0 flex items-center justify-center rounded',
        'transition-colors duration-150',
        status === 'recording'
          ? 'text-red-500 hover:text-red-400'
          : status === 'error'
            ? 'text-red-400 hover:text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        isDisabled
          ? 'opacity-50 cursor-default'
          : 'hover:bg-muted/40',
      )}
      title={title}
    >
      {icon}
    </button>
  );
}
