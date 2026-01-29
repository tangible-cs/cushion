'use client';

import React, { useEffect, useRef } from 'react';
import { CoordinatorClient } from '@/lib/coordinator-client';
import { useWorkspaceStore } from '@/stores/workspaceStore';

interface SimpleTerminalProps {
  onReady?: (terminal: any, sessionId?: string, client?: CoordinatorClient) => void;
  onResize?: (cols: number, rows: number) => void;
  currentFilePath?: string | null;
}

export const SimpleTerminal: React.FC<SimpleTerminalProps> = ({
  onReady,
  onResize,
  currentFilePath,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const coordinatorClientRef = useRef<CoordinatorClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs to avoid effect re-runs
  const onReadyRef = useRef(onReady);
  const onResizeRef = useRef(onResize);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);

  const currentFilePathRef = useRef<string | null>(null);
  useEffect(() => { currentFilePathRef.current = currentFilePath || null; }, [currentFilePath]);

  const { metadata } = useWorkspaceStore();
  const metadataRef = useRef(metadata);
  useEffect(() => { metadataRef.current = metadata; }, [metadata]);

  useEffect(() => {
    let disposed = false;
    let windowResizeHandler: (() => void) | null = null;

    const init = async () => {
      if (!terminalRef.current) return;

      // Get coordinator client
      let client: CoordinatorClient;
      try {
        const { getSharedCoordinatorClient } = await import('@/lib/shared-coordinator-client');
        client = await getSharedCoordinatorClient();
        if (disposed) return;
        coordinatorClientRef.current = client;
      } catch (error) {
        console.error('[SimpleTerminal] Failed to get coordinator client:', error);
        return;
      }

      // Dynamically import xterm and addons
      try {
        const [
          { Terminal: XTerm },
          { FitAddon },
        ] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);

        if (disposed) return;

        // Import CSS
        await import('@xterm/xterm/css/xterm.css');

        const xterm = new XTerm({
          theme: {
            background: '#1a1b26',
            foreground: '#a9b1d6',
            cursor: '#c0caf5',
            cursorAccent: '#1a1b26',
            selectionBackground: '#33467c',
            black: '#414868',
            red: '#f7768e',
            green: '#9ece6a',
            yellow: '#e0af68',
            blue: '#7aa2f7',
            magenta: '#bb9af7',
            cyan: '#73daca',
            white: '#c0caf5',
            brightBlack: '#414868',
            brightRed: '#f7768e',
            brightGreen: '#9ece6a',
            brightYellow: '#e0af68',
            brightBlue: '#7aa2f7',
            brightMagenta: '#bb9af7',
            brightCyan: '#73daca',
            brightWhite: '#c0caf5',
          },
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 14,
          lineHeight: 1.4,
          cursorBlink: true,
          cursorStyle: 'block',
          cursorWidth: 2,
          scrollback: 1000,
          tabStopWidth: 4,
          allowProposedApi: true,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);

        // Try WebGL addon, fall back to canvas
        try {
          const { WebglAddon } = await import('@xterm/addon-webgl');
          if (!disposed) xterm.loadAddon(new WebglAddon());
        } catch {
          // WebGL not available, default canvas renderer is fine
        }

        // Load WebLinks addon for clickable URLs
        try {
          const { WebLinksAddon } = await import('@xterm/addon-web-links');
          if (!disposed) xterm.loadAddon(new WebLinksAddon());
        } catch {
          // Not critical
        }

        if (disposed) {
          xterm.dispose();
          return;
        }

        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        xterm.open(terminalRef.current!);
        xterm.focus();

        // Initial fit after a brief delay for layout
        setTimeout(() => {
          if (disposed) return;
          fitAddon.fit();
          onResizeRef.current?.(xterm.cols, xterm.rows);
          xterm.focus();
        }, 100);

        // Debounced resize helper
        const debouncedFit = () => {
          if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
          resizeTimerRef.current = setTimeout(() => {
            if (disposed || !xtermRef.current || !fitAddonRef.current) return;
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current;
            if (coordinatorClientRef.current && sessionIdRef.current) {
              coordinatorClientRef.current.resizeTerminal(cols, rows);
            }
            onResizeRef.current?.(cols, rows);
          }, 150);
        };

        // ResizeObserver
        const resizeObserver = new ResizeObserver(debouncedFit);
        resizeObserver.observe(terminalRef.current!);
        resizeObserverRef.current = resizeObserver;

        // Window resize
        windowResizeHandler = debouncedFit;
        window.addEventListener('resize', windowResizeHandler);

        // Terminal output handler
        client.onTerminalOutput((output: string) => {
          if (xtermRef.current && !disposed) {
            xtermRef.current.write(output);
          }
        });

        // Create terminal session
        const workingDir = metadataRef.current?.projectPath || '/';
        try {
          const sessionResult = await client.createTerminal(workingDir);
          if (disposed) return;
          if (sessionResult.success) {
            sessionIdRef.current = sessionResult.sessionId;
          } else {
            xterm.writeln('\x1b[31mFailed to create terminal session\x1b[0m');
          }
        } catch (error) {
          if (!disposed) {
            xterm.writeln('\x1b[33mFailed to connect to coordinator server\x1b[0m');
          }
        }

        // Handle user input
        xterm.onData(async (data: string) => {
          if (coordinatorClientRef.current && sessionIdRef.current) {
            try {
              await coordinatorClientRef.current.sendTerminalInput(data);
            } catch (error) {
              xterm.write(`\r\n\x1b[31mError: ${error instanceof Error ? error.message : 'Unknown error'}\x1b[0m\r\n`);
            }
          }
        });

        // Welcome message
        xterm.writeln('\x1b[36mTerminal Initialized\x1b[0m');
        xterm.writeln('');
        xterm.writeln(`Working directory: \x1b[35m${workingDir}\x1b[0m`);
        xterm.writeln('');

        onReadyRef.current?.(xterm, sessionIdRef.current || undefined, client);
      } catch (error) {
        console.error('[SimpleTerminal] Failed to initialize terminal:', error);
      }
    };

    init();

    // Cleanup
    return () => {
      disposed = true;

      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }

      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (windowResizeHandler) {
        window.removeEventListener('resize', windowResizeHandler);
      }

      // Destroy terminal session on server
      if (coordinatorClientRef.current && sessionIdRef.current) {
        coordinatorClientRef.current.destroyTerminal().catch(() => {});
        sessionIdRef.current = null;
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      fitAddonRef.current = null;
    };
  }, []); // No dependencies - init once

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
      }}
      title="Click here to focus terminal"
      onClick={() => {
        if (xtermRef.current) {
          xtermRef.current.focus();
        }
      }}
    />
  );
};
