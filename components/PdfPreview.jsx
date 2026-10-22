import React, { useEffect, useRef, useState } from 'react';

// Draws a PDF blob page by page onto canvases with pdf.js. The preview is the exact
// file the download button saves, so what the user sees is what they send.
// pdf.js is loaded on first use only; it is already shipped for CV import (browserOcr).
let pdfjsPromise = null;
const loadPdfjs = () => (pdfjsPromise ||= (async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.js?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
})());

export default function PdfPreview({ blob, title }) {
  const hostRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');

  // Redraw whenever the box changes size so text stays sharp at any size.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!blob || !host || width < 50) return undefined;
    let cancelled = false;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const canvases = [];
        const dpr = window.devicePixelRatio || 1;
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          // Show the page at its real size (PDF points to CSS pixels: 96/72), like a
          // PDF viewer at 100%. Only shrink it when the box is narrower than the page,
          // so a wide screen never blows the text up.
          const cssWidth = Math.min(width, Math.round(base.width * (96 / 72)));
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.maxWidth = '100%';
          canvas.className = 'block mx-auto bg-white ring-1 ring-line sm:shadow-[0_1px_3px_rgba(36,19,28,0.08)]';
          canvas.setAttribute('aria-label', `${title || 'Document'}, page ${n} of ${doc.numPages}`);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (cancelled) return;
          canvases.push(canvas);
        }
        if (cancelled) return;
        host.replaceChildren(...canvases);
        setError('');
      } catch (err) {
        console.error('[preview] could not draw the PDF:', err);
        if (!cancelled) setError('Could not show the preview. The download still works.');
      }
    })();
    return () => { cancelled = true; doc?.destroy(); };
  }, [blob, width, title]);

  return (
    <div role="document" aria-label={title} className="w-full">
      <div ref={hostRef} className="flex w-full flex-col gap-3 sm:gap-6 sm:p-6" />
      {error && <p className="p-4 text-[13.5px] text-ink-muted dark:text-night-muted">{error}</p>}
    </div>
  );
}
