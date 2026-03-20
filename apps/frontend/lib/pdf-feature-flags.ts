function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isPdfProgressiveLoadingEnabled(): boolean {
  return parseBooleanEnv(import.meta.env.VITE_PDF_PROGRESSIVE_LOADING);
}
