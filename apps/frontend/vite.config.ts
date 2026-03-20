import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  optimizeDeps: {
    include: [
      'pdfjs-dist/legacy/build/pdf.mjs',
      'pdfjs-dist/legacy/web/pdf_viewer.mjs',
    ],
  },
  build: {
    target: 'chrome130',
  },
  server: {
    port: 3000,
  },
});
