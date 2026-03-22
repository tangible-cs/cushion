import { useCallback, useEffect, useState } from 'react';
import { File as FileIcon, Paperclip } from 'lucide-react';
import { type PromptAttachment } from '@/stores/chatStore';
import { createId, readAsDataUrl } from '@/lib/prompt-dom';
import { Icon } from './Icon';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const IMAGE_MIMES = new Set(ACCEPTED_IMAGE_TYPES);
const IMAGE_EXTS = new Map([
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);
const TEXT_MIMES = new Set([
  'application/json',
  'application/ld+json',
  'application/toml',
  'application/x-toml',
  'application/x-yaml',
  'application/xml',
  'application/yaml',
]);

export const SUPPORTED_TYPES = [
  ...ACCEPTED_IMAGE_TYPES,
  'application/pdf',
  'text/*',
  ...TEXT_MIMES,
  '.c', '.cc', '.cjs', '.conf', '.cpp', '.css', '.csv', '.cts', '.env',
  '.go', '.gql', '.graphql', '.h', '.hh', '.hpp', '.htm', '.html', '.ini',
  '.java', '.js', '.json', '.jsx', '.log', '.md', '.mdx', '.mjs', '.mts',
  '.py', '.rb', '.rs', '.sass', '.scss', '.sh', '.sql', '.toml', '.ts',
  '.tsx', '.txt', '.xml', '.yaml', '.yml', '.zsh',
];

const SAMPLE = 4096;

function mimeKind(type: string) {
  return type.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function fileExt(name: string) {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
}

function isTextMime(type: string) {
  if (!type) return false;
  if (type.startsWith('text/')) return true;
  if (TEXT_MIMES.has(type)) return true;
  if (type.endsWith('+json')) return true;
  return type.endsWith('+xml');
}

function isTextBytes(bytes: Uint8Array) {
  if (bytes.length === 0) return true;
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) count += 1;
  }
  return count / bytes.length <= 0.3;
}

async function detectMime(file: File): Promise<string | undefined> {
  const type = mimeKind(file.type);
  if (IMAGE_MIMES.has(type)) return type;
  if (type === 'application/pdf') return type;

  const suffix = fileExt(file.name);
  const fallback = IMAGE_EXTS.get(suffix) ?? (suffix === 'pdf' ? 'application/pdf' : undefined);
  if ((!type || type === 'application/octet-stream') && fallback) return fallback;

  if (isTextMime(type)) return 'text/plain';
  const bytes = new Uint8Array(await file.slice(0, SAMPLE).arrayBuffer());
  if (!isTextBytes(bytes)) return undefined;
  return 'text/plain';
}

export function usePromptAttachments(activeSessionId: string | null, directory: string | null, disabled?: boolean) {
  const [attachments, setAttachments] = useState<PromptAttachment[]>([]);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setAttachments([]);
  }, [activeSessionId, directory]);

  useEffect(() => {
    if (!disabled) return;
    setDragging(false);
  }, [disabled]);

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    const next: PromptAttachment[] = [];
    for (const file of files) {
      const mime = await detectMime(file);
      if (!mime) continue;
      const url = await readAsDataUrl(file);
      next.push({
        id: createId(),
        url,
        mime,
        filename: file.name,
      });
    }
    if (next.length === 0) return;
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  // Global drag/drop
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleGlobalDragOver = (event: DragEvent) => {
      if (disabled) return;
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) return;
      event.preventDefault();
      setDragging(true);
    };

    const handleGlobalDragLeave = (event: DragEvent) => {
      if (disabled) return;
      if (!event.relatedTarget) {
        setDragging(false);
      }
    };

    const handleGlobalDrop = (event: DragEvent) => {
      if (disabled) return;
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer?.files;
      if (dropped && dropped.length > 0) {
        void handleFiles(Array.from(dropped));
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver);
    document.addEventListener('dragleave', handleGlobalDragLeave);
    document.addEventListener('drop', handleGlobalDrop);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver);
      document.removeEventListener('dragleave', handleGlobalDragLeave);
      document.removeEventListener('drop', handleGlobalDrop);
    };
  }, [disabled, handleFiles]);

  return { attachments, dragging, handleFiles, removeAttachment, clearAttachments };
}

type DragOverlayProps = {
  dragging: boolean;
};

export function DragOverlay({ dragging }: DragOverlayProps) {
  if (!dragging) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 pointer-events-none">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Paperclip className="size-8" />
        <span className="text-xs">Drop files to attach</span>
      </div>
    </div>
  );
}

type AttachmentPreviewProps = {
  attachments: PromptAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {attachments.map((attachment) => {
        const isImage = attachment.mime.startsWith('image/');
        return (
          <div key={attachment.id} className="relative group">
            {isImage ? (
              <img
                src={attachment.url}
                alt={attachment.filename}
                className="size-16 rounded-md object-cover border border-border"
              />
            ) : (
              <div className="size-16 rounded-md bg-muted/20 flex items-center justify-center border border-border">
                <FileIcon className="size-5 text-muted-foreground" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-background border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove attachment"
            >
              <Icon name="close" size="small" className="text-muted-foreground" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-[var(--overlay-50)] rounded-b-md">
              <span className="text-[10px] text-foreground truncate block">{attachment.filename}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
