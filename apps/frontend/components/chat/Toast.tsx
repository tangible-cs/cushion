'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export type ToastVariant = 'default' | 'success' | 'error' | 'loading';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  description: string;
  icon?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
  persistent?: boolean;
  actions?: ToastAction[];
}

interface Toast extends ToastOptions {
  id: string;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = {
      id,
      ...options,
    };

    setToasts((prev) => [...prev, newToast]);

    if (!options.persistent && options.duration !== 0) {
      const duration = options.duration ?? 4000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {mounted && createPortal(
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const getIcon = () => {
    if (toast.icon) return toast.icon;
    switch (toast.variant) {
      case 'success':
        return <CheckCircle className="size-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="size-5 text-red-500" />;
      case 'loading':
        return <Loader2 className="size-5 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getVariantStyles = () => {
    switch (toast.variant) {
      case 'success':
        return 'border-green-500/20 bg-green-50 dark:bg-green-950/20';
      case 'error':
        return 'border-red-500/20 bg-red-50 dark:bg-red-950/20';
      case 'loading':
        return 'border-blue-500/20 bg-blue-50 dark:bg-blue-950/20';
      default:
        return 'border-border bg-background';
    }
  };

  return (
    <div
      className={`pointer-events-auto w-96 max-w-sm rounded-lg border shadow-lg p-4 transition-all duration-300 ${
        getVariantStyles()
      } ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
    >
      <div className="flex gap-3">
        {getIcon() && <div className="shrink-0 mt-0.5">{getIcon()}</div>}
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="text-sm font-medium text-foreground">{toast.title}</p>
          )}
          <p className="text-sm text-muted-foreground">{toast.description}</p>
          {toast.actions && toast.actions.length > 0 && (
            <div className="mt-2 flex gap-2">
              {toast.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => {
                    action.onClick();
                    onDismiss(toast.id);
                  }}
                  className="px-3 py-1 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {!toast.persistent && (
          <button
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
