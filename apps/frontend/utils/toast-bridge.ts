import type { ToastOptions } from '@/components/chat/Toast';

type ShowToastFn = (options: ToastOptions) => string;

let _showToast: ShowToastFn | null = null;

export function registerToastFn(fn: ShowToastFn) {
  _showToast = fn;
}

export function unregisterToastFn() {
  _showToast = null;
}

export function showGlobalToast(options: ToastOptions): string | null {
  if (!_showToast) return null;
  return _showToast(options);
}
