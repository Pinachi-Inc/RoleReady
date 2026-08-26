import axios from 'axios';
import { requireAuth } from './firebaseAuth.js';

export async function handleAiDetect(req, res) {
  if (!(await requireAuth(req, res))) return;

  const { text } = req.body || {};

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required' });
  }

  const apiKey = process.env.SAPLING_API_KEY;
  if (!apiKey) {
    console.warn('[ai-detect] SAPLING_API_KEY not set');
    return res.status(500).json({ error: 'Sapling API key not configured' });
  }

  try {
    const response = await axios.post(
      'https://api.sapling.ai/api/v1/aidetect',
      { key: apiKey, text: text.trim() },
      { headers: { 'Content-Type': 'application/json' } }
    );

    const score = response.data?.score ?? null;
    console.log('[ai-detect] score=%s wordCount=%s', score, text.trim().split(/\s+/).length);

    res.json({ score });
  } catch (err) {
    const status = err.response?.status || 500;
    const data = err.response?.data || err.message;
    console.error('[ai-detect] error status=%s data=%j', status, data);
    res.status(status).json({ error: data });
  }
}
