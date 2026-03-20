
import { useRef, useState, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileHeaderProps {
  /** Full file path */
  filePath: string;
  /** Whether the title is editable */
  editable?: boolean;
  /** Callback when the file should be renamed */
  onRename?: (newName: string) => Promise<boolean> | boolean;
  /** Callback when user exits the header (Enter, arrow down, etc.) */
  onExit?: () => void;
  /** Whether this is a new file (auto-focus title) */
  isNew?: boolean;
  /** Show file icon */
  showIcon?: boolean;
  /** Show file extension */
  showExtension?: boolean;
  /** Fixed/sticky header mode */
  fixedTitle?: boolean;
}

/**
 * File header component that displays the filename as an editable title.
 * Similar to Notion/Tangent's title behavior.
 * 
 * Features:
 * - Large, editable title
 * - Inline editing that renames the file on blur
 * - Keyboard navigation (Enter to exit, Escape to cancel)
 * - Auto-focus for new files
 * - Optional sticky positioning
 */
export function FileHeader({
  filePath,
  editable = true,
  onRename,
  onExit,
  isNew = false,
  showIcon = false,
  showExtension = false,
  fixedTitle = false,
}: FileHeaderProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const originalValueRef = useRef<string>('');

  // Extract filename and extension from path (like Tangent's node.name)
  const pathParts = filePath.split(/[/\\]/);
  const fullName = pathParts[pathParts.length - 1] || '';
  const lastDotIndex = fullName.lastIndexOf('.');
  const hasExtension = lastDotIndex > 0;
  const fileName = hasExtension ? fullName.slice(0, lastDotIndex) : fullName;
  const extension = hasExtension ? fullName.slice(lastDotIndex) : '';

  // Store original name when editing starts
  useEffect(() => {
    originalValueRef.current = fileName;
  }, [fileName]);

  // Auto-focus and select for new files
  useEffect(() => {
    if (isNew && titleRef.current && editable) {
      titleRef.current.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isNew, editable]);

  const handleSave = useCallback(async () => {
    if (!titleRef.current || !editable) return;
    
    const newName = titleRef.current.textContent?.trim() || '';
    
    // Don't rename if empty or unchanged
    if (!newName || newName === originalValueRef.current) {
      // Restore original name if empty
      if (!newName && titleRef.current) {
        titleRef.current.textContent = originalValueRef.current;
      }
      setIsEditing(false);
      return;
    }

    // Rename the file (like Tangent does)
    if (onRename) {
      const success = await onRename(newName);
      if (!success && titleRef.current) {
        // Revert on failure
        titleRef.current.textContent = originalValueRef.current;
      } else {
        originalValueRef.current = newName;
      }
    }
    
    setIsEditing(false);
  }, [editable, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editable) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
      onExit?.();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      // Revert changes
      if (titleRef.current) {
        titleRef.current.textContent = originalValueRef.current;
      }
      titleRef.current?.blur();
      onExit?.();
      return;
    }

    // Arrow down or End at end of text -> exit to editor
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      titleRef.current?.blur();
      onExit?.();
      return;
    }
  }, [editable, onExit]);

  const handleClick = useCallback(() => {
    if (!editable || !titleRef.current) return;
    
    // Select all text on click
    const range = document.createRange();
    range.selectNodeContents(titleRef.current);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    
    setIsEditing(true);
  }, [editable]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
    originalValueRef.current = fileName;
  }, [fileName]);

  const handleBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  // Prevent newlines in the title
  const handleInput = useCallback((e: React.FormEvent<HTMLSpanElement>) => {
    const target = e.target as HTMLSpanElement;
    // Remove any newlines
    if (target.textContent?.includes('\n')) {
      target.textContent = target.textContent.replace(/\n/g, '');
    }
  }, []);

  // Tangent uses --headerFontSizeFactor of ~2.5
  const fontSizeFactor = 2;
  const contentPaddingX = 'var(--md-content-padding-x, 1.25em)';
  const horizontalPadding = `calc(${contentPaddingX} / ${fontSizeFactor})`;
  const headerMaxWidth =
    `calc(var(--md-content-max-width, 900px) + (2 * (${contentPaddingX} / ${fontSizeFactor})))`;

  return (
    <header
      className={cn(
        "file-header",
        fixedTitle && "file-header-fixed",
        isEditing && "file-header-editing"
      )}
      style={{
        /*
         * Match CodeMirror's layout model:
         * - content column width = --md-content-max-width
         * - horizontal inset lives outside the content column
         *
         * Header text aligns with body text by using the same inset and
         * increasing max-width by 2x inset.
         */
        maxWidth: headerMaxWidth,
        margin: '0 auto',
        boxSizing: 'border-box',
        /* Scale padding from body text space to title space */
        paddingTop: `calc(2em / ${fontSizeFactor})`,
        paddingBottom: `calc(0.8em / ${fontSizeFactor})`,
        paddingLeft: horizontalPadding,
        paddingRight: horizontalPadding,
        /* Typography - like Tangent but bigger */
        fontFamily: 'var(--md-font-family, inherit)',
        fontSize: `calc(var(--md-font-size, 16px) * ${fontSizeFactor})`,
        fontWeight: 500,
        color: 'var(--md-text, var(--foreground))',
        lineHeight: 1.2,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        ...(fixedTitle ? {
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: 'linear-gradient(var(--md-bg, var(--background)) 92%, transparent)',
        } : {}),
      }}
    >
      {showIcon && (
        <span 
          className="file-header-icon"
          style={{ 
            marginRight: '0.3em',
            opacity: 0.7,
            verticalAlign: 'middle',
          }}
        >
          <FileText size="1em" />
        </span>
      )}
      
      <span
        ref={titleRef}
        className="file-header-title"
        contentEditable={editable}
        suppressContentEditableWarning
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        style={{
          outline: 'none',
          cursor: editable ? 'text' : 'default',
          minWidth: '1em',
          display: 'inline-block',
        }}
        spellCheck={false}
      >
        {fileName}
      </span>
      
      {showExtension && extension && (
        <span 
          className="file-header-extension"
          style={{
            opacity: 0.5,
            fontSize: '0.6em',
            marginLeft: '0.2em',
            verticalAlign: 'middle',
          }}
        >
          {extension}
        </span>
      )}
    </header>
  );
}
