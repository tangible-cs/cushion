export const PDF_SHORTCUT_IDS = [
  'pdf.search.open',
  'pdf.search.next',
  'pdf.search.prev',
  'pdf.search.close',
  'pdf.save',
  'pdf.zoom.in',
  'pdf.zoom.out',
  'pdf.zoom.reset',
] as const;

// Annotation editor modes from pdf.js
export const AnnotationEditorType = {
  DISABLE: -1,
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  STAMP: 13,
  INK: 15,
} as const;

// Param types from pdf.js AnnotationEditorParamsType (src/shared/util.js)
export const AnnotationEditorParamsType = {
  RESIZE: 1,
  CREATE: 2,
  FREETEXT_SIZE: 11,
  FREETEXT_COLOR: 12,
  FREETEXT_OPACITY: 13,
  INK_COLOR: 21,
  INK_THICKNESS: 22,
  INK_OPACITY: 23,
  HIGHLIGHT_COLOR: 31,
  HIGHLIGHT_THICKNESS: 32,
  HIGHLIGHT_FREE: 33,
  HIGHLIGHT_SHOW_ALL: 34,
} as const;

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Green', hex: '#00FF00' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Pink', hex: '#FF69B4' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Orange', hex: '#FFA500' },
];

export type EditorMode = 'none' | 'freetext' | 'ink' | 'highlight' | 'stamp';

// Default annotation tool colors (functional values passed to pdf.js, not UI chrome)
export const DEFAULT_FREETEXT_COLOR = '#000000';
export const DEFAULT_INK_COLOR = '#000000';
export const DEFAULT_HIGHLIGHT_COLOR = '#FFFF00';
