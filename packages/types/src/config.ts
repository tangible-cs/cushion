/**
 * Per-workspace config file schemas for `.cushion/` folder.
 *
 * Each interface maps 1:1 to a JSON file in `<workspace>/.cushion/`.
 * All fields are optional — missing keys use defaults defined in the frontend.
 */

export interface CushionSettings {
  readableLineLength?: boolean;
  showLineNumber?: boolean;
  spellcheck?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  autoPairBrackets?: boolean;
  foldHeading?: boolean;
  foldIndent?: boolean;
  showHiddenFiles?: boolean;
  showCushionFiles?: boolean;
  fileSortOrder?: 'alphabetical' | 'modified' | 'created';
}

export interface CushionAppearance {
  theme?: 'light' | 'dark' | 'system';
  accentColor?: string;
  baseFontSize?: number;
  textFontFamily?: string;
  monospaceFontFamily?: string;
  interfaceFontFamily?: string;
}

export interface CushionWorkspace {
  tabs?: Array<{
    id: string;
    filePath: string;
    isPinned: boolean;
    isPreview: boolean;
    order: number;
  }>;
  activeTab?: string | null;
  rightPanel?: {
    mode: 'chat' | 'none';
    width: number;
  };
  lastOpenFiles?: string[];
  sidebarWidth?: number;
}

export interface CushionChat {
  baseUrl?: string;
  selectedModel?: { providerID: string; modelID: string } | null;
  selectedAgent?: string | null;
  selectedVariant?: string | null;
  displayPreferences?: {
    showThinking: boolean;
    shellToolPartsExpanded: boolean;
    editToolPartsExpanded: boolean;
  };
  modelVisibility?: Record<string, 'show' | 'hide'>;
}
