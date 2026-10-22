// Checks for the AI endpoints' guard rails: provider errors never reach the browser as their
// own status (a provider 402 used to open the paywall), size caps, timeouts, and the free
// plan's CV import limit.
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/hardening.test.mjs

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'https://model.invalid/v1';
process.env.OPENAI_MODEL = 'test/default-model';
delete process.env.BILLING_ENFORCED;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleOptimizeRequest } = await import('../../server/core/optimizeHandler.js');
const { handlePdfProcessing } = await import('../../server/core/pdfHandler.js');
const fs = globalThis.__E2E_FS;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token(uid) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64url({
    sub: uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: 'google.com' },
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600,
  });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function call(handler, uid, body) {
  const req = { headers: { authorization: `Bearer ${token(uid)}` }, body };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() {},
  };
  await handler(req, res);
  return res;
}

const optimize = (uid, extra = {}) => call(handleOptimizeRequest, uid, { jobDescription: 'Platform role', aiUserInfo: '{"experienceSource":[]}', ...extra });
const used = (uid, kind) => fs.get(`users/${uid}`)?.lifetimeUsage?.[kind] || 0;
const importText = (uid) => call(handlePdfProcessing, uid, { extractedText: 'A long enough CV text for the import to start. '.repeat(3) });

const out = console.log.bind(console);
console.log = console.warn = console.error = () => {};

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    out(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    out(`  FAIL ${name}\n       ${err?.message || err}`);
  } finally {
    delete globalThis.__E2E_MODEL_FAIL;
    delete process.env.BILLING_ENFORCED;
  }
}

await check('a provider 402 (credit ran out) is a 502, not the paywall, and the run is refunded', async () => {
  globalThis.__E2E_MODEL_FAIL = { status: 402 };
  const res = await optimize('h1');
  assert.equal(res.statusCode, 502);
  assert.notEqual(res.body.code, 'upgrade_required');
  assert.equal(typeof res.body.error, 'string');
  assert.ok(!JSON.stringify(res.body).includes('provider says no'), 'provider detail is not passed on');
  assert.equal(used('h1', 'optimizations'), 0);
});

await check('a provider 401 is a 502, so it never reads as the user signed out', async () => {
  globalThis.__E2E_MODEL_FAIL = { status: 401 };
  assert.equal((await optimize('h2')).statusCode, 502);
});

await check('a provider 429 stays 429; a timeout is 504', async () => {
  globalThis.__E2E_MODEL_FAIL = { status: 429 };
  assert.equal((await optimize('h3')).statusCode, 429);
  globalThis.__E2E_MODEL_FAIL = { code: 'ECONNABORTED' };
  assert.equal((await optimize('h3')).statusCode, 504);
  assert.equal(used('h3', 'optimizations'), 0);
});

await check('model calls carry a timeout', async () => {
  assert.equal((await optimize('h4')).statusCode, 200);
  assert.ok(globalThis.__E2E_LAST_MODEL_TIMEOUT > 0 && globalThis.__E2E_LAST_MODEL_TIMEOUT < 300_000);
});

await check('max_tokens and temperature from the browser are clamped', async () => {
  await optimize('h5', { max_tokens: 100000, temperature: 7 });
  assert.equal(globalThis.__E2E_LAST_MODEL_BODY.max_tokens, 6000);
  assert.equal(globalThis.__E2E_LAST_MODEL_BODY.temperature, 1);
  await optimize('h5');
  assert.equal(globalThis.__E2E_LAST_MODEL_BODY.max_tokens, 4000);
  assert.equal(globalThis.__E2E_LAST_MODEL_BODY.temperature, 0.45);
});

await check('an oversized job posting is refused before any run is counted', async () => {
  const res = await optimize('h6', { jobDescription: 'x'.repeat(30_001) });
  assert.equal(res.statusCode, 400);
  assert.equal(used('h6', 'optimizations'), 0);
});

await check('a failed CV import is not counted', async () => {
  // The fake model answers with a CV, not the import format, so the import fails.
  const res = await importText('h7');
  assert.equal(res.statusCode, 500);
  assert.equal(used('h7', 'pdfImports'), 0);
});

await check('free accounts get 10 imports when enforced; paid plans are not limited', async () => {
  process.env.BILLING_ENFORCED = 'true';
  fs.set('users/h8', { lifetimeUsage: { pdfImports: 10 } });
  const res = await importText('h8');
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.code, 'upgrade_required');
  fs.set('users/h9', { plan: 'paid', lifetimeUsage: { pdfImports: 50 } });
  assert.notEqual((await importText('h9')).statusCode, 402);
});

out(`hardening: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
