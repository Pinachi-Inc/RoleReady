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
