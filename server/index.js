import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { handleOptimizeRequest } from './core/optimizeHandler.js';
import { handlePdfProcessing, uploadMiddleware } from './core/pdfHandler.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

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

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});


