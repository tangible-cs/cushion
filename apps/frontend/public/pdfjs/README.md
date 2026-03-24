# PDF.js public assets

This directory is synced from `apps/frontend/node_modules/pdfjs-dist/legacy/web`.

## Update workflow

1. Upgrade `pdfjs-dist` in `apps/frontend/package.json`.
2. Run `bun run sync:pdfjs-assets` from the repo root.
3. Run `bun run verify:pdfjs-assets`.
4. Commit the updated files in `apps/frontend/public/pdfjs/`.

## Notes

- The sync script rewrites CSS image paths to `/pdfjs/images/...` for runtime consistency.
- If upstream CSS references an image that is missing in `pdfjs-dist`, that reference is rewritten to `none` during sync to avoid broken file references.
