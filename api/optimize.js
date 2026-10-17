// Vercel API route for /api/optimize
// Uses the same shared handler as Express and Firebase Functions

import { handleOptimizeRequest } from '../server/core/optimizeHandler.js';
import { applyCors } from '../server/core/cors.js';

// Vercel serverless function
export default async function handler(req, res) {
  // Cross-origin callers must be listed in ALLOWED_ORIGINS; same-origin needs nothing.
  applyCors(req, res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests for this endpoint
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Use the same shared handler as Express and Firebase Functions
  // (it performs the Firebase ID token check itself)
  return handleOptimizeRequest(req, res);
}
