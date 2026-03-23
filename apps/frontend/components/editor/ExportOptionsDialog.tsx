import { useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PdfExportOptions,
  PdfPageSize,
  PdfOrientation,
  PdfMarginPreset,
} from '@cushion/types';

interface ExportOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (options: PdfExportOptions) => void;
}

const PAGE_SIZES: { value: PdfPageSize; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
  { value: 'Legal', label: 'Legal' },
];

const ORIENTATIONS: { value: PdfOrientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const MARGINS: { value: PdfMarginPreset; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'narrow', label: 'Narrow' },
  { value: 'none', label: 'None' },
];

export function ExportOptionsDialog({
  isOpen,
  onClose,
  onExport,
}: ExportOptionsDialogProps) {
  const [pageSize, setPageSize] = useState<PdfPageSize>('A4');
  const [orientation, setOrientation] = useState<PdfOrientation>('portrait');
  const [margins, setMargins] = useState<PdfMarginPreset>('default');
  const [showLinkUrls, setShowLinkUrls] = useState(false);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');

  if (!isOpen) return null;

  const handleExport = () => {
    onExport({ pageSize, orientation, margins, showLinkUrls, headerText, footerText });
  };

  return (
    <div
      className="fixed inset-0 z-confirm flex items-center justify-center bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[520px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-border-subtle text-foreground-muted">
            <FileDown size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              Export PDF
            </h3>
            <p className="text-sm text-foreground-muted leading-normal">
              Configure export settings
            </p>
          </div>
          <button
            className="shrink-0 p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-4">
          <OptionRow label="Page size">
            <SegmentedControl
              options={PAGE_SIZES}
              value={pageSize}
              onChange={setPageSize}
            />
          </OptionRow>

          <OptionRow label="Orientation">
            <SegmentedControl
              options={ORIENTATIONS}
              value={orientation}
              onChange={setOrientation}
            />
          </OptionRow>

          <OptionRow label="Margins">
            <SegmentedControl
              options={MARGINS}
              value={margins}
              onChange={setMargins}
            />
          </OptionRow>

          <OptionRow label="Header">
            <input
              type="text"
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="Optional"
              className="w-48 px-2.5 py-1.5 rounded text-sm bg-transparent border border-modal-border text-foreground placeholder:text-foreground-muted/50 outline-none focus:border-accent transition-colors"
            />
          </OptionRow>

          <OptionRow label="Footer">
            <input
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Optional"
              className="w-48 px-2.5 py-1.5 rounded text-sm bg-transparent border border-modal-border text-foreground placeholder:text-foreground-muted/50 outline-none focus:border-accent transition-colors"
            />
          </OptionRow>

          <OptionRow label="Show link URLs">
            <button
              onClick={() => setShowLinkUrls(!showLinkUrls)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
                showLinkUrls
                  ? 'bg-accent border-accent'
                  : 'bg-[var(--border-subtle)] border-border',
              )}
            >
              <span
                className={cn(
                  'inline-block size-4 rounded-full bg-surface shadow transition-transform',
                  showLinkUrls ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </button>
          </OptionRow>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 pt-4 pb-5">
          <button
            className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none bg-accent text-surface hover:bg-accent-hover transition-all"
            onClick={handleExport}
            autoFocus
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground-muted">{label}</span>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded text-sm cursor-pointer transition-all',
            opt.value === value
              ? 'bg-accent text-surface'
              : 'bg-transparent border border-modal-border text-foreground-muted hover:bg-[var(--overlay-10)]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
