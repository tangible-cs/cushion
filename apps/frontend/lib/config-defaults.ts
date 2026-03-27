/**
 * Default values for `.cushion/` config files.
 *
 * Each config type has all-required defaults so that a partial file
 * from disk can be spread over them: `{ ...defaults, ...parsed }`.
 */

import type { CushionSettings, CushionWorkspace, CushionAppearance, CushionChat } from '@cushion/types';

export const DEFAULT_SETTINGS: Required<CushionSettings> = {
  readableLineLength: true,
  showLineNumber: false,
  spellcheck: true,
  autoSave: true,
  autoSaveDelay: 1000,
  autoPairBrackets: true,
  foldHeading: true,
  foldIndent: true,
  showHiddenFiles: false,
  showCushionFiles: false,
  fileSortOrder: 'alphabetical',
  respectGitignore: true,
  allowedExtensions: [
    '.md', '.txt', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp',
    '.pdf',
    '.excalidraw', '.canvas',
    '.mp3', '.wav', '.ogg', '.flac', '.m4a',
    '.mp4', '.webm', '.mov',
  ],
  trashMethod: 'cushion',
  confirmSystemTrash: true,
};

export const DEFAULT_WORKSPACE: Required<CushionWorkspace> = {
  tabs: [],
  activeTab: null,
  rightPanel: { mode: 'none', width: 360 },
  lastOpenFiles: [],
  sidebarWidth: 240,
};

export const DEFAULT_APPEARANCE: Required<CushionAppearance> = {
  theme: 'system',
  accentColor: '',
  baseFontSize: 16,
  textFontFamily: '',
  monospaceFontFamily: '',
  interfaceFontFamily: '',
};

export const DEFAULT_CHAT: Required<CushionChat> = {
  baseUrl: '',
  selectedModel: null,
  selectedAgent: null,
  selectedVariant: null,
  displayPreferences: {
    showThinking: false,
    shellToolPartsExpanded: true,
    editToolPartsExpanded: false,
  },
  modelVisibility: {},
};
