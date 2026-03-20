
import { memo, useState } from 'react';
import { Ban } from 'lucide-react';
import { Collapsible } from './Collapsible';
import { CopyButton } from './CopyButton';

interface ToolErrorCardProps {
  tool: string;
  error: string;
  defaultOpen?: boolean;
}

const TOOL_NAMES: Record<string, string> = {
  read: 'Read',
  list: 'List',
  glob: 'Glob',
  grep: 'Grep',
  task: 'Agent',
  webfetch: 'Web Fetch',
  websearch: 'Web Search',
  bash: 'Shell',
  edit: 'Edit',
  write: 'Write',
  apply_patch: 'Patch',
  question: 'Questions',
};

function parseError(tool: string, raw: string) {
  const cleaned = raw.replace(/^Error:\s*/, '').trim();
  const prefix = `${tool} `;
  const tail = cleaned.startsWith(prefix) ? cleaned.slice(prefix.length) : cleaned;
  const parts = tail.split(': ');
  if (parts.length > 1) {
    const head = (parts[0] ?? '').trim();
    if (head && head.length < 40) {
      return {
        title: head[0].toUpperCase() + head.slice(1),
        body: parts.slice(1).join(': ').trim() || cleaned,
        cleaned,
      };
    }
  }
  return { title: 'Failed', body: cleaned, cleaned };
}

export const ToolErrorCard = memo(function ToolErrorCard({
  tool,
  error,
  defaultOpen = false,
}: ToolErrorCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const name = TOOL_NAMES[tool] ?? tool;
  const { title, body, cleaned } = parseError(tool, error);

  return (
    <div data-component="tool-error-card" data-open={open ? 'true' : 'false'}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Collapsible.Trigger>
          <div data-component="tool-trigger">
            <div data-slot="basic-tool-tool-trigger-content">
              <span data-slot="tool-error-card-icon">
                <Ban size={14} />
              </span>
              <div data-slot="basic-tool-tool-info">
                <div data-slot="basic-tool-tool-info-structured">
                  <div data-slot="basic-tool-tool-info-main">
                    <span data-slot="basic-tool-tool-title">{name}</span>
                    <span data-slot="basic-tool-tool-subtitle">{title}</span>
                  </div>
                </div>
              </div>
            </div>
            <Collapsible.Arrow />
          </div>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div data-slot="tool-error-card-content">
            <div data-slot="tool-error-card-copy">
              <CopyButton text={cleaned} />
            </div>
            <p data-slot="tool-error-card-body">{body}</p>
          </div>
        </Collapsible.Content>
      </Collapsible>
    </div>
  );
});
