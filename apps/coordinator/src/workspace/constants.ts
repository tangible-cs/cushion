/** Patterns ignored by both file listing and the file watcher */
export const IGNORED_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.nyc_output',
  '.cushion-trash',
];

/** Default file extensions shown in the explorer in vault mode (allowlist). */
export const DEFAULT_ALLOWED_EXTENSIONS = [
  '.md',
  '.txt',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  '.pdf',
  '.excalidraw',
  '.canvas',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.m4a',
  '.mp4',
  '.webm',
  '.mov',
];
