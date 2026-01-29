# Implementing WYSIWYG & PDF Features in Cushion

Based on analysis of Tangent Notes (tangentnotes.com).

---

## Implementation Status (Updated)

### Completed Features

1. **CSS Theming System** (`apps/frontend/styles/markdown-editor.css`)
   - CSS custom properties for all colors, typography, spacing
   - Dark/light theme support
   - Tangent-inspired rhythm units and spacing

2. **Improved WYSIWYG Extension** (`apps/frontend/lib/codemirror-wysiwyg/`)
   - Better typography with proper heading scales (H1-H6)
   - CSS class-based styling instead of inline styles
   - Improved hide/reveal behavior

3. **Better Widgets**
   - SVG-based checkbox with animations
   - Image widget with loading states and captions
   - Improved HR widget with CSS variables

4. **Focus Mode** (`apps/frontend/lib/codemirror-wysiwyg/focus-mode.ts`)
   - Toggle-able focus mode
   - Fades lines away from cursor
   - Configurable range
   - Smooth transitions

5. **PDF Viewer Upgrade** (`apps/frontend/components/editor/PdfViewer.tsx`)
   - Better zoom controls with presets
   - Page navigation
   - Device pixel ratio support
   - PdfPreview component for embedding
   - Gradient overlay for previews

### Usage

```tsx
// Enable WYSIWYG with focus mode
import { wysiwygExtension, setFocusMode } from '@/lib/codemirror-wysiwyg';

// In CodeEditor
extensions.push(wysiwygExtension({ focusMode: false }));

// Toggle focus mode programmatically
setFocusMode(view, true);
```

---

---

## 1. WYSIWYG Markdown Editing

### What Tangent Does

Tangent uses a **"hybrid WYSIWYG"** approach — markdown syntax is dynamically **hidden when the cursor is away** and **revealed when the cursor enters** a formatted region. This gives users rich-text visuals while preserving the underlying markdown file.

**Technical stack**: Custom fork of [Typewriter](https://github.com/taylorhadden/typewriter) (Delta-format editor, Svelte, Superfine virtual DOM). Not ProseMirror or CodeMirror.

**Key behaviors**:
- `**bold**` renders as **bold** with asterisks hidden; cursor entering the word reveals them
- Headers show styled text without the `#` prefix until you click the line
- Lists render with proper bullets/numbers, syntax revealed on focus
- Code blocks get syntax highlighting via vscode-textmate
- Math blocks render via KaTeX, diagrams via Mermaid
- Images/video/audio embed inline via `![[file]]` or `![](url)` syntax

### How to Implement in Cushion

Cushion currently uses CodeMirror for plain-text editing. There are **two viable paths**:

---

#### Option A: CodeMirror with WYSIWYG Decorations (Recommended)

Keep CodeMirror as the editor engine and add decorations that hide/reveal markdown syntax.

**Why**: Cushion already has CodeMirror wired to the coordinator. This is incremental, not a rewrite.

**Implementation steps**:

1. **Create a `markdown-wysiwyg` CodeMirror extension** (`apps/frontend/lib/codemirror-markdown-wysiwyg.ts`)
   - Use CodeMirror's `Decoration` and `ViewPlugin` APIs
   - Parse the markdown syntax tree (CodeMirror's `@lezer/markdown` already does this)
   - For each formatting node (`**`, `_`, `#`, etc.), create `Decoration.replace()` to hide syntax characters
   - Track cursor position via `EditorView.updateListener`; when cursor enters a formatted range, remove the hiding decoration to reveal syntax

2. **Formatting ranges to handle**:
   | Markdown syntax | Visual result | Hide what |
   |----------------|---------------|-----------|
   | `**text**` | **text** | The `**` delimiters |
   | `*text*` | *text* | The `*` delimiters |
   | `~~text~~` | ~~text~~ | The `~~` delimiters |
   | `` `code` `` | styled code | The backticks |
   | `# Heading` | large styled text | The `# ` prefix |
   | `- item` | bullet item | The `- `, replace with bullet glyph |
   | `- [x] todo` | checkbox | The `- [x] `, replace with checkbox widget |
   | `[text](url)` | styled link | The `[`, `](url)` parts |
   | `![alt](url)` | inline image | Entire syntax, replace with `<img>` widget |

3. **Widget decorations** for complex elements:
   - `Decoration.widget()` for images, checkboxes, code block headers
   - `Decoration.line()` for heading styles, blockquote gutters
   - Use CodeMirror's `WidgetType` class to render React/DOM elements

4. **Cursor-aware reveal logic**:
   ```ts
   // Pseudocode for the ViewPlugin
   update(update: ViewUpdate) {
     const cursorPos = update.state.selection.main.head;
     // For each hidden decoration, check if cursor is inside its source range
     // If yes: remove the hiding decoration (reveal syntax)
     // If no: apply the hiding decoration (show WYSIWYG)
   }
   ```

5. **Toolbar** (optional, for discoverability):
   - Add a floating formatting toolbar on text selection
   - Buttons insert/wrap markdown syntax (not HTML — always markdown)

**Packages needed**:
- `@codemirror/lang-markdown` (already likely included)
- `@lezer/markdown` (parser, comes with lang-markdown)
- No new major dependencies

**Estimated complexity**: Medium-high. The core show/hide mechanism is ~500-800 lines. Each formatting type adds ~50-100 lines.

---

#### Option B: Replace CodeMirror with TipTap/ProseMirror

Use a true rich-text framework that outputs markdown.

**Why not**: Cushion explicitly dropped ProseMirror/TipTap in its design. This would reverse that decision and require rewriting the coordinator's document tracking (which currently assumes plain text changes). Not recommended unless the project pivots to full WYSIWYG.

---

#### Option C: Milkdown

[Milkdown](https://milkdown.dev/) is a plugin-driven markdown editor built on ProseMirror that provides WYSIWYG with markdown as the source format.

**Pros**: Purpose-built for this exact use case, active development, plugin system.
**Cons**: Still ProseMirror under the hood, would require reworking coordinator document sync.

---

### Recommended Approach: Option A

Stick with CodeMirror. Build the WYSIWYG layer as an **opt-in extension** so users can toggle between plain markdown and WYSIWYG mode.

**File structure**:
```
apps/frontend/lib/
  codemirror-wysiwyg/
    index.ts              # Main extension export
    hide-markup.ts        # Decoration logic for hiding syntax
    reveal-on-cursor.ts   # Cursor tracking + reveal logic
    widgets/
      image-widget.ts     # Inline image rendering
      checkbox-widget.ts  # Todo checkbox
      link-widget.ts      # Clickable link display
      code-block.ts       # Syntax-highlighted code blocks
      math-block.ts       # KaTeX rendering (optional)
```

**Integration with existing editor**:
```ts
// In MarkdownEditor.tsx, add the extension conditionally
const wysiwygExtension = createWysiwygExtension();

const extensions = [
  markdown(),
  // ... existing extensions
  ...(wysiwygEnabled ? [wysiwygExtension] : []),
];
```

---

## 2. PDF Support

### What Tangent Does

- **PDF viewing**: Opens `.pdf` files as standalone views using **pdfjs-dist** (Mozilla PDF.js)
- **PDF embedding**: `![[document.pdf]]` renders the PDF inline in a note
- **No PDF export**: Tangent does NOT export markdown to PDF

### How to Implement in Cushion

Two features to build: **viewing** and **export**.

---

### 2A. PDF Viewing

**Goal**: Open `.pdf` files in the editor panel, just like text files.

**Implementation**:

1. **Install pdfjs-dist**:
   ```
   pnpm add pdfjs-dist --filter @cushion/frontend
   ```

2. **Create `PdfViewer.tsx`** (`apps/frontend/components/editor/PdfViewer.tsx`):
   ```tsx
   // Core approach:
   // - Load PDF via pdfjs-dist
   // - Render each page to a <canvas> element
   // - Wrap in a scrollable container
   // - Support zoom controls

   import * as pdfjsLib from 'pdfjs-dist';

   // Set worker (required by PDF.js)
   pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
   ```

3. **Integrate with file opening logic**:
   - In the editor tab system, detect `.pdf` extension
   - Instead of loading CodeMirror, render `<PdfViewer path={filePath} />`
   - Load the file as binary via a new coordinator endpoint or direct fetch

4. **Coordinator change**: Add a `workspace/read-file-binary` method that returns base64-encoded file content for binary files. Alternatively, serve files via HTTP from the coordinator (simpler for large PDFs).

5. **PDF embedding in markdown** (optional, matches Tangent):
   - In the WYSIWYG extension, detect `![[*.pdf]]` or `![](*.pdf)` patterns
   - Render an inline `PdfViewer` widget via `Decoration.widget()`

**Packages needed**:
- `pdfjs-dist` (~3MB, well-maintained by Mozilla)

---

### 2B. PDF Export

**Goal**: Export the current markdown file as a formatted PDF.

**Implementation options**:

#### Option 1: Browser Print API (Simplest)

1. Render the markdown to HTML using `marked` or `markdown-it`
2. Open in a hidden iframe with print-optimized CSS
3. Call `window.print()` → user picks "Save as PDF"

```ts
import { marked } from 'marked';

function exportToPdf(markdownContent: string) {
  const html = marked(markdownContent);
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head><style>
        body { font-family: serif; max-width: 700px; margin: auto; padding: 2rem; }
        code { background: #f4f4f4; padding: 2px 4px; }
        pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; }
      </style></head>
      <body>${html}</body>
    </html>
  `);
  printWindow.print();
}
```

**Pros**: Zero dependencies, works everywhere.
**Cons**: Limited control over output, relies on browser print dialog.

#### Option 2: Server-side with Puppeteer/Playwright (Best quality)

1. Add a coordinator endpoint `workspace/export-pdf`
2. On the server: render markdown → HTML → PDF using Puppeteer's `page.pdf()`
3. Return the PDF binary to the client for download

```ts
// Coordinator handler
import puppeteer from 'puppeteer';

async function exportPdf(markdown: string): Promise<Buffer> {
  const html = renderMarkdownToHtml(markdown);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4', margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } });
  await browser.close();
  return pdf;
}
```

**Pros**: High-quality output, full CSS control, headers/footers, page breaks.
**Cons**: Puppeteer is a heavy dependency (~300MB for Chromium).

#### Option 3: `md-to-pdf` package (Good balance)

Uses Puppeteer internally but provides a simpler API specifically for markdown-to-PDF.

```ts
import { mdToPdf } from 'md-to-pdf';

const pdf = await mdToPdf({ content: markdownString }, {
  stylesheet: ['custom-styles.css'],
  pdf_options: { format: 'A4', margin: '1in' }
});
```

**Pros**: Purpose-built, supports front-matter options, custom CSS.
**Cons**: Still needs Puppeteer/Chromium.

#### Recommended: Start with Option 1, upgrade to Option 3 later.

---

### 2C. PDF Feature — File Structure

```
apps/frontend/components/editor/
  PdfViewer.tsx           # PDF viewing component (pdfjs-dist)

apps/frontend/lib/
  pdf-export.ts           # PDF export logic (browser print initially)

apps/coordinator/src/
  handlers/pdf.ts         # (Future) Server-side PDF export endpoint
```

---

## Summary & Priority

| Feature | Effort | Dependencies | Priority |
|---------|--------|-------------|----------|
| WYSIWYG (CodeMirror decorations) | High | None new | P1 — core differentiator |
| PDF viewing | Low | pdfjs-dist | P2 — quick win |
| PDF export (browser print) | Low | marked | P3 — easy first pass |
| PDF export (server-side) | Medium | puppeteer/md-to-pdf | P4 — upgrade later |
| PDF embedding in markdown | Medium | pdfjs-dist + WYSIWYG | P5 — after WYSIWYG exists |

### Suggested phase ordering:
1. Build WYSIWYG extension for CodeMirror (biggest lift, most value)
2. Add PDF viewing alongside text file support
3. Add basic PDF export via browser print
4. Later: upgrade export, add embedding
