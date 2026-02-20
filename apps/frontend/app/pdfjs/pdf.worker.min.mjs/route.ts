import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { NextResponse } from 'next/server';

const require = createRequire(import.meta.url);
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

export async function GET() {
  const worker = await readFile(workerPath);
  return new NextResponse(worker, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
