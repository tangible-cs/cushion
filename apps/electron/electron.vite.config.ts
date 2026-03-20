import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const frontendRoot = resolve(__dirname, '../frontend');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: frontendRoot,
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(frontendRoot, 'index.html'),
      },
    },
    resolve: {
      alias: {
        '@': frontendRoot,
      },
    },
    css: {
      postcss: {
        plugins: [
          tailwindcss({ config: resolve(frontendRoot, 'tailwind.config.ts') }),
          autoprefixer(),
        ],
      },
    },
    plugins: [react()],
    optimizeDeps: {
      include: [
        'pdfjs-dist/legacy/build/pdf.mjs',
        'pdfjs-dist/legacy/web/pdf_viewer.mjs',
      ],
    },
  },
});
