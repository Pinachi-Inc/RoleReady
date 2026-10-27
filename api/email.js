// Vercel API route for /api/email: unsubscribe links, the daily reminder cron, the email
// previews and the verification and password-reset emails, selected with ?action=. One file
// keeps us inside Vercel Hobby's function limit.

import { handleEmailEndpoint } from '../server/core/lifecycleEmails.js';
import { applyCors } from '../server/core/cors.js';

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  return handleEmailEndpoint(req, res);
}
