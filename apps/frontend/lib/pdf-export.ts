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
  body {
    font-family: Georgia, 'Times New Roman', serif;
    max-width: 800px;
    margin: 40px auto;
    padding: 0 20px;
    line-height: 1.6;
    color: #1a1a1a;
    font-size: 14px;
  }
  h1, h2, h3, h4, h5, h6 { font-family: -apple-system, sans-serif; margin-top: 1.5em; }
  h1 { font-size: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.2em; }
  code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
  pre { background: #f4f4f4; padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 16px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f4f4f4; }
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
