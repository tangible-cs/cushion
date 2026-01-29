'use client';

import React from 'react';
import { SimpleTerminal } from './SimpleTerminal';
import { CoordinatorClient } from '@/lib/coordinator-client';

interface TerminalProps {
  onReady?: (terminal: any, sessionId?: string, client?: CoordinatorClient) => void;
  onResize?: (cols: number, rows: number) => void;
  className?: string;
  style?: React.CSSProperties;
  currentFilePath?: string | null;
}

export const Terminal: React.FC<TerminalProps> = ({
  onReady,
  onResize,
  className,
  style,
  currentFilePath,
}) => {
  return (
    <div className={className} style={style}>
      <SimpleTerminal
        onReady={onReady}
        onResize={onResize}
        currentFilePath={currentFilePath}
      />
    </div>
  );
};
