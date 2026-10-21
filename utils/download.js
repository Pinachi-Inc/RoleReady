import { convertMarkdownToHtml } from './markdown.js';

export const generateDownloadHtml = (cvContent) => {
  const htmlContent = convertMarkdownToHtml(cvContent);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Optimized CV</title>
  <style>
    @media print { .print-instructions { display: none !important; } body { margin: 0; } }
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 8.5in; margin: 0 auto; padding: 0.5in; background: white; }
    .print-instructions { background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin-bottom: 24px; text-align: center; }
    .print-button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
    .print-button:hover { background: #2563eb; }
    .main-title { font-size: 24px; font-weight: bold; text-align: center; margin-bottom: 8px; color: #1f2937; }
    .section-title { font-size: 18px; font-weight: bold; margin-top: 24px; margin-bottom: 12px; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
    p { margin-bottom: 8px; text-align: justify; }
    ul { margin: 8px 0; padding-left: 20px; }
    li { margin-bottom: 4px; }
    strong { color: #1f2937; }
    .contact-info { text-align: center; margin-bottom: 24px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="print-instructions">
    <p><strong>Ready to save as PDF?</strong></p>
    <p>Click the button below, then select "Save as PDF" in the print dialog.</p>
    <button class="print-button" onclick="window.print()">Print to PDF</button>
  </div>
  <div class="cv-content">${htmlContent}</div>
</body>
</html>`;
};

export const downloadHtml = (htmlContent, filename = 'optimized-cv.html') => {
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};



// Saves a Blob (the CV or cover letter PDF) through the browser's normal download.
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
