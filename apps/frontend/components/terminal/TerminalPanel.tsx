'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Square, RotateCcw, Trash2 } from 'lucide-react';
import { Terminal } from './Terminal';
import { useTerminal } from '@/hooks/useTerminal';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { formatShortcutList, useShortcutBindings, useShortcutHandler } from '@/lib/shortcuts';

interface TerminalPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

const TERMINAL_SHORTCUT_IDS = ['app.terminal.toggle', 'terminal.clear'] as const;

export const TerminalPanel: React.FC<TerminalPanelProps> = ({
  isVisible,
  onClose,
}) => {
  const { metadata } = useWorkspaceStore();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [terminalHeight, setTerminalHeight] = useState(400);
  const terminalShortcuts = useShortcutBindings(TERMINAL_SHORTCUT_IDS);

  const {
    state: terminalState,
    initializeTerminal,
    clear,
    stopProcess,
    restartProcess,
  } = useTerminal({
    onStatusChange: (status) => {
      console.log('[TerminalPanel] Terminal status changed:', status);
    },
  });

  // Handle keyboard shortcuts (US-E1)
  const terminalHandlers = useMemo(() => ({
    'app.terminal.toggle': () => { onClose(); },
    'terminal.clear': () => { clear(); },
  } as const), [onClose, clear]);

  useShortcutHandler({
    handlers: terminalHandlers,
    enabled: isVisible,
  });

  // Handle resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = startHeight + (startY - e.clientY);
      setTerminalHeight(Math.max(200, Math.min(window.innerHeight - 100, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={`terminal-panel bg-gray-900 border-t border-gray-700 flex flex-col ${
        isMaximized ? 'fixed inset-0 z-50' : ''
      }`}
      style={{
        height: isMaximized ? '100vh' : `${terminalHeight}px`,
        cursor: isResizing ? 'ns-resize' : 'default'
      }}
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          {/* Terminal Controls */}
          <div className="flex gap-1">
            <button
              onClick={onClose}
              className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              title="Close Terminal"
            />
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            />
            <button
              className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
              title="Terminal Actions"
            />
          </div>

          {/* Terminal Title */}
          <div className="flex-1 ml-4">
            <span className="text-gray-300 text-sm font-mono flex items-center gap-2">
              Terminal
              {terminalState.isProcessRunning && (
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Process running" />
              )}
              {terminalState.error && (
                <span className="w-2 h-2 bg-red-500 rounded-full" title="Error occurred" />
              )}
              {metadata && (
                <span className="text-gray-400">
                  {' '}· {metadata.projectPath.split('/').pop() || 'Project'}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Terminal Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors flex items-center gap-1"
            title={(() => {
              const label = formatShortcutList(terminalShortcuts['terminal.clear']);
              return label ? `Clear Terminal (${label})` : 'Clear Terminal';
            })()}
          >
            <Trash2 size={12} />
            Clear
          </button>
          <button
            onClick={restartProcess}
            disabled={!metadata}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Restart Terminal"
          >
            <RotateCcw size={12} />
            Restart
          </button>
          <button
            onClick={stopProcess}
            disabled={!terminalState.isProcessRunning}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Stop Process"
          >
            <Square size={12} />
          </button>
        </div>
      </div>

      {/* Terminal Content Area */}
      <div className="flex-1 overflow-hidden relative bg-black">
        <Terminal
          onReady={initializeTerminal}
          className="w-full h-full"
        />

        {/* Overlay message when no workspace is open */}
        {!metadata && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90">
            <div className="text-center text-gray-400">
              <div className="mb-4 text-lg">No Workspace Open</div>
              <div className="text-sm mb-2">Open a project folder to use the terminal</div>
              <div className="text-xs text-gray-500">
                The terminal will start in your project directory
              </div>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {terminalState.error && (
          <div className="absolute top-4 right-4 bg-red-900 bg-opacity-90 text-red-200 px-3 py-2 rounded text-sm max-w-md">
            <div className="font-semibold">Terminal Error</div>
            <div className="text-xs">{terminalState.error}</div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      {!isMaximized && (
        <div
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-500 transition-colors"
          onMouseDown={handleMouseDown}
          title="Drag to resize terminal"
        />
      )}
    </div>
  );
};
