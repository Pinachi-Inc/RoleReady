// Vercel API route for /api/optimize
// Uses the same shared handler as Express and Firebase Functions

import { handleOptimizeRequest } from '../server/core/optimizeHandler.js';

// Vercel serverless function
export default async function handler(req, res) {
  // Enable CORS for all origins (adjust as needed)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
  return handleOptimizeRequest(req, res);
}
