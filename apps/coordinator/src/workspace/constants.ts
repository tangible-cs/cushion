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
  // Documents
  '.md',
  '.txt',
  '.csv',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.bmp',
  // Embeds
  '.pdf',
  // Canvas / drawing
  '.excalidraw',
  '.canvas',
  // Audio
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.m4a',
  // Video
  '.mp4',
  '.webm',
  '.mov',
];
