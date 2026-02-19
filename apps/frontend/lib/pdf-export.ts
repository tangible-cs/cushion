import { marked } from 'marked';

export async function exportToPdf(markdownContent: string, filename: string): Promise<void> {
  const htmlContent = await marked(markdownContent);

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to export PDF');
    return;
  }

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${filename}</title>
<style>
  :root {
    --N0: #ffffff;
    --N1: #fafafa;
    --N2: #f5f5f5;
    --N3: #f0f0f0;
    --N4: #e0e0e0;
    --N7: #6b6b6b;
    --N8: #333333;
    --A500: #3b82f6;
    --background: var(--N1);
    --surface: var(--N0);
    --foreground: var(--N8);
    --foreground-muted: var(--N7);
    --border: var(--N4);
    --border-subtle: var(--N3);
    --code-bg: var(--N2);
    --accent-primary: var(--A500);
  }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
    line-height: 1.6;
    color: var(--foreground);
    background: var(--surface);
    font-size: 14px;
  }
  h1, h2, h3, h4, h5, h6 { font-family: -apple-system, sans-serif; margin-top: 1.5em; color: var(--foreground); }
  h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.2em; }
  a { color: var(--accent-primary); }
  code { background: var(--code-bg); padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre { background: var(--code-bg); padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid var(--border); margin-left: 0; padding-left: 16px; color: var(--foreground-muted); }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid var(--border); padding: 8px; text-align: left; }
  th { background: var(--border-subtle); }
  img { max-width: 100%; }
  @media print {
    body { margin: 0; padding: 20px; }
  }
</style>
</head>
<body>${htmlContent}</body>
</html>`);

  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}
