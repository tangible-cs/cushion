'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

type CopyButtonProps = {
  text: string;
  className?: string;
  label?: string;
};

export function CopyButton({ text, className, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!text) return;
    const clipboard = navigator?.clipboard;
    if (!clipboard) return;

    await clipboard.writeText(text);
    setCopied(true);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      data-component="copy-button"
      data-copied={copied ? 'true' : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        handleCopy().catch(() => undefined);
      }}
      className={className}
      aria-label={copied ? 'Copied!' : label}
      title={copied ? 'Copied!' : label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
