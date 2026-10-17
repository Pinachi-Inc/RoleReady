// OCR for scanned CVs, run in the browser.
//
// The server refuses image-based PDFs on purpose: OCR there means a long-running,
// memory-hungry job inside a serverless function, which the project's own
// PDF_EXTRACTION_CONFIG.md flags as liable to time out on Vercel and to need a higher
// memory tier on Firebase. Doing it client-side removes the function timeout, the memory
// ceiling and the per-page cost, and the PDF never leaves the machine.
//
// This is strictly a fallback. The server's text path is untouched and still runs first;
// nothing here executes unless the server has already reported the file as image-based.

// The server passes disableWorker, which is a Node-side arrangement. In a browser
// pdfjs insists on a real worker and throws 'No GlobalWorkerOptions.workerSrc specified'
// without one. A worker is what we want here anyway: page rasterisation stays off the
// main thread, so the UI keeps responding while a scan is being read. Vite's ?url
// suffix hands back the emitted asset path.

// Rendering scale. ~2.0 puts a 595pt-wide A4 page near 1650px, which is roughly the
// 200dpi Tesseract wants; much higher costs time and memory for little accuracy gain.
const RENDER_SCALE = 2.0;
const MAX_PAGES = 5;

let _assetPromise = null;   // in-flight or completed prefetch
let _pdfjsPromise = null;
let _tesseractPromise = null;

const loadPdfjs = () => (_pdfjsPromise ||= (async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  const { default: workerSrc } = await import('pdfjs-dist/legacy/build/pdf.worker.min.js?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjs;
})());
const loadTesseract = () => (_tesseractPromise ||= import('tesseract.js'));

// Skip on metered or slow connections. The user who cannot afford ~7MB unprompted is
// exactly the one who would resent it most. Absent API means assume it is fine.
function connectionAllowsPrefetch() {
  const c = navigator.connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !['slow-2g', '2g'].includes(c.effectiveType);
}

/**
 * Warms the OCR assets so a later scan does not begin with a ~7MB download.
 * Safe to call repeatedly; the work happens once. Never throws.
 */
export function prefetchOcrAssets({ force = false } = {}) {
  if (_assetPromise) return _assetPromise;
  if (!force && !connectionAllowsPrefetch()) {
    console.log('[ocr] skipping prefetch on a metered or slow connection');
    return Promise.resolve(false);
  }

  const run = async () => {
    try {
      const t0 = performance.now();
      await Promise.all([loadPdfjs(), loadTesseract()]);
      // Creating a worker is what actually pulls the wasm core and the language data.
      const { createWorker } = await loadTesseract();
      const worker = await createWorker('eng');
      await worker.terminate();
      console.log('[ocr] assets warmed in %sms', Math.round(performance.now() - t0));
      return true;
    } catch (err) {
      // A failed warmup must be invisible: the real run will fetch them again.
      console.warn('[ocr] prefetch failed, will load on demand:', err?.message || err);
      _assetPromise = null;
      return false;
    }
  };

  _assetPromise = (typeof requestIdleCallback === 'function')
    ? new Promise((resolve) => requestIdleCallback(() => resolve(run()), { timeout: 3000 }))
    : run();

  return _assetPromise;
}

/**
 * Renders each page to a canvas and OCRs it.
 * @param {File|Blob} file
 * @param {(p:{page:number,pages:number,progress:number}) => void} [onProgress]
 * @returns {Promise<string>} extracted text
 */
export async function ocrPdfInBrowser(file, onProgress) {
  const pdfjs = await loadPdfjs();
  const { createWorker } = await loadTesseract();

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);

  const worker = await createWorker('eng');
  const out = [];

  try {
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: RENDER_SCALE });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Tesseract does better on a white ground than on the transparent one a
      // canvas starts with, which composites to black in some encoders.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      onProgress?.({ page: n, pages, progress: (n - 1) / pages });

      const { data: { text } } = await worker.recognize(canvas);
      if (text?.trim()) out.push(text.trim());

      // Free the bitmap before the next page; five A4 pages at this scale is
      // ~50MB of canvas otherwise.
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await worker.terminate();
    doc.destroy?.();
  }

  onProgress?.({ page: pages, pages, progress: 1 });
  return out.join('\n\n');
}

export function isOcrSupported() {
  return typeof window !== 'undefined'
    && typeof WebAssembly === 'object'
    && typeof document?.createElement === 'function';
}
