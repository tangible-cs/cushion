'use client';

import { useState, useCallback, useRef } from 'react';
import type { CoordinatorClient } from '@/lib/coordinator-client';

interface TerminalState {
  isProcessRunning: boolean;
  error: string | null;
}

interface UseTerminalOptions {
  onStatusChange?: (status: string) => void;
}

interface UseTerminalReturn {
  state: TerminalState;
  initializeTerminal: (terminal: any, sessionId?: string, client?: CoordinatorClient) => void;
  clear: () => void;
  stopProcess: () => void;
  restartProcess: () => void;
}

export function useTerminal(options?: UseTerminalOptions): UseTerminalReturn {
  const [state, setState] = useState<TerminalState>({
    isProcessRunning: false,
    error: null,
  });

  const terminalRef = useRef<any>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const clientRef = useRef<CoordinatorClient | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const initializeTerminal = useCallback(
    (terminal: any, sessionId?: string, client?: CoordinatorClient) => {
      terminalRef.current = terminal;
      sessionIdRef.current = sessionId;
      clientRef.current = client;

      setState({ isProcessRunning: false, error: null });
      optionsRef.current?.onStatusChange?.('initialized');
    },
    []
  );

  const clear = useCallback(() => {
    if (terminalRef.current) {
      try {
        terminalRef.current.clear();
        optionsRef.current?.onStatusChange?.('cleared');
      } catch (err) {
        console.error('[useTerminal] Failed to clear:', err);
      }
    }
  }, []);

  const stopProcess = useCallback(() => {
    // Send Ctrl+C (ETX character) to the terminal to interrupt the running process
    if (clientRef.current && sessionIdRef.current) {
      clientRef.current.sendTerminalInput('\x03').catch((err) => {
        console.error('[useTerminal] Failed to send SIGINT:', err);
      });
    }
    if (terminalRef.current) {
      terminalRef.current.write('\r\n\x1b[33m[Process interrupted]\x1b[0m\r\n');
    }
    setState((prev) => ({ ...prev, isProcessRunning: false }));
    optionsRef.current?.onStatusChange?.('stopped');
  }, []);

  const restartProcess = useCallback(async () => {
    // Destroy the current terminal session and create a new one
    if (clientRef.current && sessionIdRef.current) {
      try {
        await clientRef.current.destroyTerminal();
      } catch {
        // ignore destroy errors
      }
    }

    if (terminalRef.current) {
      terminalRef.current.clear();
      terminalRef.current.writeln('\x1b[36mRestarting terminal...\x1b[0m');
    }

    // Create a new session
    if (clientRef.current) {
      try {
        const result = await clientRef.current.createTerminal('/');
        if (result.success) {
          sessionIdRef.current = result.sessionId;
          if (terminalRef.current) {
            terminalRef.current.writeln('\x1b[32mTerminal restarted.\x1b[0m\r\n');
          }
        } else {
          if (terminalRef.current) {
            terminalRef.current.writeln('\x1b[31mFailed to restart terminal.\x1b[0m');
          }
        }
      } catch (err) {
        console.error('[useTerminal] Failed to restart:', err);
        if (terminalRef.current) {
          terminalRef.current.writeln('\x1b[31mFailed to restart terminal.\x1b[0m');
        }
      }
    }

    setState({ isProcessRunning: false, error: null });
    optionsRef.current?.onStatusChange?.('restarted');
  }, []);

  return {
    state,
    initializeTerminal,
    clear,
    stopProcess,
    restartProcess,
  };
}
