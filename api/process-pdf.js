import { handlePdfProcessing, uploadMiddleware } from '../server/core/pdfHandler.js';
import { applyCors } from '../server/core/cors.js';

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // A JSON body carries client-extracted OCR text, not a file. multer has nothing to
  // do there and its parser expects multipart, so route around it.
  if ((req.headers['content-type'] || '').includes('application/json')) {
    return handlePdfProcessing(req, res);
  }

  // Use multer middleware for file upload
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    // Call the PDF processing handler (it performs the Firebase ID token check itself)
    return handlePdfProcessing(req, res);
  });
}
