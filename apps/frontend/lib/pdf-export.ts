import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import hljsTheme from 'highlight.js/styles/github.css?raw';
import type { PdfExportOptions } from '@cushion/types';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

const MARGIN_MAP: Record<PdfExportOptions['margins'], string> = {
  default: '25mm 20mm',
  narrow: '15mm 10mm',
  none: '0',
};

export async function exportToPdf(
  markdown: string,
  title: string,
  options: PdfExportOptions,
): Promise<void> {
  const html = buildPdfHtml(markdown, title, options);
  await window.electronAPI!.exportPdf({ html, title, options });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function buildPdfHtml(
  source: string,
  title: string,
  options: PdfExportOptions,
): string {
  const renderer = new Renderer();

  renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    let highlighted: string;
    if (lang && hljs.getLanguage(lang)) {
      highlighted = hljs.highlight(text, { language: lang }).value;
    } else {
      highlighted = hljs.highlightAuto(text).value;
    }
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return `<pre><code${langClass}>${highlighted}</code></pre>\n`;
  };

  renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
    const id = slugify(text);
    return `<h${depth} id="${escapeHtml(id)}">${text}</h${depth}>\n`;
  };

  const body = marked.parse(source, { async: false, renderer }) as string;

  const pageSize = options.pageSize;
  const orientation =
    options.orientation === 'landscape' ? ' landscape' : '';
  const margin = MARGIN_MAP[options.margins];

  const linkUrlRule = options.showLinkUrls
    ? 'a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; color: #666666; }'
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page {
    size: ${pageSize}${orientation};
    margin: ${margin};
    @bottom-center {
      content: counter(page);
      font-size: 9pt;
      color: #1a1a1a;
    }${options.headerText ? `
    @top-left {
      content: "${escapeHtml(options.headerText).replace(/"/g, '\\"')}";
      font-size: 9pt;
      color: #1a1a1a;
    }` : ''}${options.footerText ? `
    @bottom-left {
      content: "${escapeHtml(options.footerText).replace(/"/g, '\\"')}";
      font-size: 9pt;
      color: #1a1a1a;
    }` : ''}
  }

  * { box-sizing: border-box; }

  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
    background: #ffffff;
    margin: 0;
    padding: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    color: #111111;
    page-break-after: avoid;
  }

  h1 { font-size: 2em; }
  h2 { font-size: 1.5em; }
  h3 { font-size: 1.25em; }

  body > :first-child { margin-top: 0; }

  p {
    margin: 0.8em 0;
    orphans: 3;
    widows: 3;
  }

  a { color: #2563eb; text-decoration: none; }
  ${linkUrlRule}

  code {
    background: #f3f3f3;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  pre {
    background: #f6f6f6;
    border: 1px solid #e0e0e0;
    padding: 14px 16px;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    page-break-inside: avoid;
  }

  pre code {
    background: none;
    padding: 0;
    border-radius: 0;
  }

  blockquote {
    border-left: 4px solid #d0d0d0;
    margin: 1em 0;
    padding: 0.5em 0 0.5em 16px;
    color: #555555;
    page-break-inside: avoid;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    page-break-inside: avoid;
  }

  th, td {
    border: 1px solid #d0d0d0;
    padding: 8px 12px;
    text-align: left;
  }

  th { background: #f0f0f0; font-weight: 600; }

  img {
    max-width: 100%;
    page-break-inside: avoid;
  }

  hr {
    border: none;
    border-top: 1px solid #d0d0d0;
    margin: 2em 0;
  }

  ul, ol { padding-left: 2em; }
  li { margin: 0.3em 0; }

  ${hljsTheme}
</style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
