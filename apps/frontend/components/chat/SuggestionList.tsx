import { Brain } from 'lucide-react';
import { getDirectory, getFilename } from '@/lib/path-utils';

export type TriggerType = 'command' | 'mention';

export type TriggerState = {
  type: TriggerType;
  query: string;
  start: number;
};

export type SuggestionItem = {
  id: string;
  label: string;
  value: string;
  description?: string;
  type: TriggerType;
  path?: string;
  agent?: string;
  group?: 'agent' | 'recent' | 'search' | 'default';
};

export const BUILTIN_COMMANDS: SuggestionItem[] = [
  { id: 'undo', label: '/undo', value: '/undo', description: 'Undo last user message', type: 'command' },
  { id: 'redo', label: '/redo', value: '/redo', description: 'Redo last undone message', type: 'command' },
  { id: 'compact', label: '/compact', value: '/compact', description: 'Compact this session', type: 'command' },
  { id: 'summarize', label: '/summarize', value: '/summarize', description: 'Compact this session', type: 'command' },
  { id: 'share', label: '/share', value: '/share', description: 'Share this session', type: 'command' },
  { id: 'unshare', label: '/unshare', value: '/unshare', description: 'Unshare this session', type: 'command' },
  { id: 'clear', label: '/clear', value: '/clear', description: 'Clear the input', type: 'command' },
  { id: 'reset', label: '/reset', value: '/reset', description: 'Clear input and context', type: 'command' },
];

type SuggestionListProps = {
  suggestions: SuggestionItem[];
  onSelect: (item: SuggestionItem) => void;
};

export function SuggestionList({ suggestions, onSelect }: SuggestionListProps) {
  const items = suggestions.slice(0, 20);

  if (items.length === 0) {
    return (
      <div
        className="absolute inset-x-0 -top-3 -translate-y-full origin-bottom-left z-20
               max-h-72 overflow-auto rounded-md border border-border bg-background shadow-md p-1 thin-scrollbar"
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="px-2 py-2 text-xs text-muted-foreground">No results found</div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-x-0 -top-3 -translate-y-full origin-bottom-left z-20
             max-h-72 overflow-auto rounded-md border border-border bg-background shadow-md p-1 thin-scrollbar"
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const isAgent = 'agent' in item && !!item.agent;
        const hasPath = 'path' in item && !!item.path;
        const agent = isAgent ? item.agent : undefined;
        const description = 'description' in item ? item.description : undefined;
        const filePath: string = hasPath && 'path' in item ? (item.path as string) : '';
        const dir = hasPath ? getDirectory(filePath) : '';

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="w-full flex items-center gap-2 rounded-md px-2 py-1 text-xs text-left text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground transition-colors"
          >
            {isAgent ? (
              <>
                <Brain className="shrink-0 size-3.5" style={{ color: 'var(--md-accent)' }} />
                <span className="truncate">{agent}</span>
              </>
            ) : hasPath ? (
              <div className="flex items-baseline min-w-0 truncate">
                {dir && (
                  <span className="text-muted-foreground">{dir}/</span>
                )}
                <span className="text-foreground">
                  {filePath.endsWith('/') ? filePath : getFilename(filePath)}
                </span>
              </div>
            ) : (
              <>
                <span className="text-foreground">{item.label}</span>
                {description && <span className="text-muted-foreground">{description}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
