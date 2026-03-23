export type PdfPageSize = 'A4' | 'Letter' | 'Legal';
export type PdfOrientation = 'portrait' | 'landscape';
export type PdfMarginPreset = 'default' | 'narrow' | 'none';

export interface PdfExportOptions {
  pageSize: PdfPageSize;
  orientation: PdfOrientation;
  margins: PdfMarginPreset;
  showLinkUrls: boolean;
  headerText: string;
  footerText: string;
}
