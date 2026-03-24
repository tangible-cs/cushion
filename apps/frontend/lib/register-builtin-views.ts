import { registerView } from './view-registry';
import { ImageViewer } from '@/components/editor/ImageViewer';
import { PdfViewerNative } from '@/components/editor/PdfViewerNative';
import { ExcalidrawView } from '@/components/editor/ExcalidrawView';

let registered = false;

export function registerBuiltinViews(): void {
  if (registered) return;
  registered = true;

  registerView('image', {
    displayName: 'Image Viewer',
    component: ImageViewer,
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
  });

  registerView('pdf', {
    displayName: 'PDF Viewer',
    component: PdfViewerNative,
    extensions: ['pdf'],
  });

  registerView('excalidraw', {
    displayName: 'Excalidraw',
    component: ExcalidrawView,
    extensions: ['excalidraw'],
  });
}
