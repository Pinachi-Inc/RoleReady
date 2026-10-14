// Vercel API route for /api/stripe-webhook
// Uses the same shared handler as Express and Firebase Functions

import { handleStripeWebhook } from '../server/core/billing.js';

// Called by Stripe, not the browser, so no CORS. Authenticated by the Stripe-Signature header,
// which the shared handler verifies against the raw body. That body must be left unread here:
// touching req.body would make Vercel parse it, and the signature is over the original bytes.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  return handleStripeWebhook(req, res);
}
