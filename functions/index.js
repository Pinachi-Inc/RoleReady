const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');

// Since the shared handlers use ES modules, we need to import them differently
let handleOptimizeRequest;
let handlePdfProcessing;
let uploadMiddleware;

// Initialize the handlers asynchronously
async function initializeHandlers() {
  if (!handleOptimizeRequest) {
    const optimizeModule = await import('../server/core/optimizeHandler.js');
    handleOptimizeRequest = optimizeModule.handleOptimizeRequest;
    
    const pdfModule = await import('../server/core/pdfHandler.js');
    handlePdfProcessing = pdfModule.handlePdfProcessing;
    uploadMiddleware = pdfModule.uploadMiddleware;
  }
  return { handleOptimizeRequest, handlePdfProcessing, uploadMiddleware };
}

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: true, // Allow all origins in development, restrict in production
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));

// Simple request logger for Firebase Functions
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url } = req;
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[firebase-function] ${method} ${url} -> ${res.statusCode} ${ms}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'encver-api',
    environment: 'firebase-functions',
    timestamp: new Date().toISOString()
  });
});

// Main optimize endpoint using shared handler
app.post('/optimize', async (req, res) => {
  const { handleOptimizeRequest } = await initializeHandlers();
  return handleOptimizeRequest(req, res);
});

// PDF processing endpoint
app.post('/process-pdf', async (req, res) => {
  const { handlePdfProcessing, uploadMiddleware } = await initializeHandlers();
  
  // Use multer middleware for file upload
  uploadMiddleware(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message });
    }
    
    // Call the PDF processing handler
    return handlePdfProcessing(req, res);
  });
});

// Billing. The webhook needs no special body handling here: Firebase keeps the original
// bytes on req.rawBody, which is what the shared handler verifies the signature against.
async function billingHandlers() {
  return import('../server/core/billing.js');
}

app.post('/billing/checkout', async (req, res) => (await billingHandlers()).handleCreateCheckout(req, res));
app.post('/billing/portal', async (req, res) => (await billingHandlers()).handleCustomerPortal(req, res));
app.post('/billing/status', async (req, res) => (await billingHandlers()).handleBillingStatus(req, res));
app.post('/lemonsqueezy-webhook', async (req, res) => (await billingHandlers()).handleBillingWebhook(req, res));
app.post('/history', async (req, res) => (await import('../server/core/historyHandler.js')).handleHistory(req, res));
app.post('/feedback', async (req, res) => (await import('../server/core/feedbackHandler.js')).handleFeedback(req, res));

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app);

// Optional: Export individual functions for better performance
// exports.optimize = functions.https.onRequest((req, res) => {
//   if (req.method !== 'POST') {
//     return res.status(405).json({ error: 'Method not allowed' });
//   }
//   return handleOptimizeRequest(req, res);
// });
