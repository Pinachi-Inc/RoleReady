import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleOptimizeRequest } from './core/optimizeHandler.js';
import { handlePdfProcessing, uploadMiddleware } from './core/pdfHandler.js';
import { handleAiDetect } from './core/aiDetectHandler.js';
import { handleHistory } from './core/historyHandler.js';
import { handleGithubVerify } from './core/githubVerifyHandler.js';
import { handleCreateCheckout, handleCustomerPortal, handleBillingStatus, handleStripeWebhook } from './core/billing.js';

dotenv.config();

const app = express();

// Same-origin callers (the Vite dev proxy included) send no Origin and are always
// allowed. Cross-origin callers must be listed in ALLOWED_ORIGINS.
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
}));

// Stripe signs the exact bytes it sends, so the webhook must see the raw body. Registered
// before express.json, which would otherwise consume and re-shape it.
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// OCR text from a scanned CV can run past the old 1mb ceiling.
app.use(express.json({ limit: '4mb' }));

// Simple request logger
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[http] ${method} ${url} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

const PORT = process.env.PORT || 8787;

// Use the shared handler for the optimize endpoint
app.post('/api/optimize', handleOptimizeRequest);

// PDF processing endpoint
app.post('/api/process-pdf', uploadMiddleware, handlePdfProcessing);

// AI detection endpoint
app.post('/api/detect-ai', handleAiDetect);

// Billing
app.post('/api/billing/checkout', handleCreateCheckout);
app.post('/api/billing/portal', handleCustomerPortal);
app.post('/api/billing/status', handleBillingStatus);

// Saved run history (paid)
app.post('/api/history', handleHistory);

// Confirms a GitHub user's email with GitHub after sign-in
app.post('/api/auth/github-verify', handleGithubVerify);

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});


