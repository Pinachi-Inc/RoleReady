// Vercel API route for /api/billing/portal
// Uses the same shared handler as Express and Firebase Functions

import { handleCustomerPortal } from '../../server/core/billing.js';
import { applyCors } from '../../server/core/cors.js';

export default async function handler(req, res) {
  // Cross-origin callers must be listed in ALLOWED_ORIGINS; same-origin needs nothing.
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // The shared handler performs the Firebase ID token check itself
  return handleCustomerPortal(req, res);
}
