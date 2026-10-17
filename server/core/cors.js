// Origins permitted to call the API cross-origin, as a comma-separated env var.
// Unset means no CORS headers are emitted at all, which is correct when the SPA
// is served from the same origin as the API (Vercel, Firebase Hosting, and the
// Vite dev proxy all are).
export function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveAllowedOrigin(req) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return null;
  if (allowed.includes('*')) return '*';

  const origin = req.headers?.origin;
  return origin && allowed.includes(origin) ? origin : null;
}

export function applyCors(req, res) {
  const origin = resolveAllowedOrigin(req);
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    if (origin !== '*') res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
