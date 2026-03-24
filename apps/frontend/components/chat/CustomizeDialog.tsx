import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Blocks, Cable, BookOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkillsPanel } from './SkillsPanel';
import { McpsPanel } from './McpsPanel';
import { NotebookLmPanel } from './NotebookLmPanel';

type Tab = 'skills' | 'mcps' | 'notebooklm';

type CustomizeDialogProps = {
  onClose: () => void;
};

export function CustomizeDialog({ onClose }: CustomizeDialogProps) {
  const [activeTab, setActiveTab] = useState<Tab>('skills');

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-[var(--overlay-50)] p-8"
      onClick={onClose}
    >
      <div
        className="flex h-full max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-modal-border bg-modal-bg shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left nav */}
        <div className="flex w-[150px] shrink-0 flex-col gap-1 border-r border-border p-2">
          <TabButton
            icon={<Blocks className="size-4" />}
            label="Skills"
            active={activeTab === 'skills'}
            onClick={() => setActiveTab('skills')}
          />
          <TabButton
            icon={<Cable className="size-4" />}
            label="MCPs"
            active={activeTab === 'mcps'}
            onClick={() => setActiveTab('mcps')}
          />
          <TabButton
            icon={<BookOpen className="size-4" />}
            label="NotebookLM"
            active={activeTab === 'notebooklm'}
            onClick={() => setActiveTab('notebooklm')}
            badge="Unofficial"
          />
        </div>

        {/* Right panel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <h2 className="text-[15px] font-medium text-foreground">
              {activeTab === 'skills' ? 'Skills' : activeTab === 'mcps' ? 'MCPs' : 'NotebookLM'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="size-6 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--overlay-10)] hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          {activeTab === 'skills' ? <SkillsPanel /> : activeTab === 'mcps' ? <McpsPanel /> : <NotebookLmPanel />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

type TabButtonProps = {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: string;
};

function TabButton({ icon, label, active, onClick, badge }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
        active
          ? 'bg-[var(--overlay-10)] text-foreground'
          : 'text-muted-foreground hover:bg-[var(--overlay-10)] hover:text-foreground',
      )}
    >
      {icon}
      <span className="flex flex-col items-start">
        {label}
        {badge && (
          <span className="text-[9px] leading-none font-normal text-yellow-500">{badge}</span>
        )}
      </span>
    </button>
  );
}

// Shared toggle component used by both panels
type VisibilityToggleProps = {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

export function VisibilityToggle({ checked, label, onChange }: VisibilityToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full border border-border transition-colors',
        checked ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
