// Vercel API route for /api/detect-ai
import { handleAiDetect } from '../server/core/aiDetectHandler.js';
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

  return handleAiDetect(req, res);
}
