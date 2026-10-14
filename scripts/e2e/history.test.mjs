// End-to-end checks for saved history and plan limits, run against the real handlers with an
// in-memory Firestore, locally signed Firebase tokens and a stubbed model (see loader.mjs).
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/history.test.mjs
//
// Stripe is not involved: plan changes are written to the user document directly, which is
// what the signed webhook does (its own checks live with the billing work).

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'https://model.invalid/v1';
process.env.UNLIMITED_EMAILS = 'comped@example.com';
delete process.env.BILLING_ENFORCED;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleOptimizeRequest } = await import('../../server/core/optimizeHandler.js');
const { handleHistory } = await import('../../server/core/historyHandler.js');
const { getEntitlement, getUserDoc } = await import('../../server/core/firestore.js');
const fs = globalThis.__E2E_FS;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64url({ sub: uid, email, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function call(handler, uid, body = {}, { auth = true } = {}) {
  const req = { headers: auth ? { authorization: `Bearer ${token(uid, `${uid}@example.com`)}` } : {}, body };
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

const optimize = (uid) => call(handleOptimizeRequest, uid, { jobDescription: 'Platform role', aiUserInfo: '{"experienceSource":[]}' });
const history = (uid, body) => call(handleHistory, uid, body);
const runIds = (uid) => [...fs.keys()].filter((k) => k.startsWith(`users/${uid}/history/`));
const setPlan = (uid, plan) => fs.set(`users/${uid}`, { ...(fs.get(`users/${uid}`) || {}), plan });

// Server logs are noise here; the harness prints through `out`.
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
    out(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}

out('history and plan limits');

let freeList;
await check('unauthenticated history request is refused', async () => {
  const res = await call(handleHistory, 'nobody', {}, { auth: false });
  assert.equal(res.statusCode, 401);
});

await check('free runs are saved', async () => {
  for (let i = 0; i < 7; i += 1) {
    const res = await optimize('free1');
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  }
  assert.equal(runIds('free1').length, 7);
});

await check('free list: newest 5 in full, newest first', async () => {
  const res = await history('free1');
  assert.equal(res.statusCode, 200);
  freeList = res.body;
  assert.equal(freeList.visibleLimit, 5);
  assert.equal(freeList.runs.length, 5);
  assert.deepEqual(freeList.runs.map((r) => r.jobTitle), ['Role 7', 'Role 6', 'Role 5', 'Role 4', 'Role 3']);
  for (const r of freeList.runs) {
    assert.ok(r.id && r.createdAt && r.companyName, 'row has id, date and company');
    assert.equal(r.cv, undefined, 'list carries no CV bodies');
  }
});

await check('free list: older runs come back locked, date only', async () => {
  assert.equal(freeList.lockedCount, 2);
  assert.equal(freeList.lockedRuns.length, 2);
  for (const stub of freeList.lockedRuns) assert.deepEqual(Object.keys(stub), ['createdAt']);
  assert.ok(freeList.lockedRuns[0].createdAt > freeList.lockedRuns[1].createdAt, 'stubs newest first');
  assert.ok(freeList.runs[4].createdAt > freeList.lockedRuns[0].createdAt, 'stubs are older than visible runs');
});

const lockedId = () => {
  const visible = new Set(freeList.runs.map((r) => r.id));
  return runIds('free1').map((k) => k.split('/').pop()).find((id) => !visible.has(id));
};

await check('free can open a visible run with CV and letter fields', async () => {
  const res = await history('free1', { id: freeList.runs[0].id });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.run.jobTitle, 'Role 7');
  assert.ok(res.body.run.cv && res.body.run.cvContent.length > 0, 'CV body and rendered markdown');
  assert.ok('coverLetter' in res.body.run);
});

await check('free cannot open a locked run (402 upgrade_required)', async () => {
  const res = await history('free1', { id: lockedId() });
  assert.equal(res.statusCode, 402);
  assert.equal(res.body.code, 'upgrade_required');
  assert.equal(res.body.run, undefined);
});

await check('missing run is 404, malformed id is 400', async () => {
  assert.equal((await history('free1', { id: 'doesnotexist' })).statusCode, 404);
  assert.equal((await history('free1', { id: '../x' })).statusCode, 400);
  assert.equal((await history('free1', { id: 42 })).statusCode, 400);
});

await check('free with 5 or fewer runs has nothing locked', async () => {
  for (let i = 0; i < 3; i += 1) await optimize('free2');
  const res = await history('free2');
  assert.equal(res.body.runs.length, 3);
  assert.equal(res.body.lockedCount, 0);
  assert.deepEqual(res.body.lockedRuns, []);
});

await check('upgrading unlocks every saved run', async () => {
  setPlan('free1', 'paid');
  const res = await history('free1');
  assert.equal(res.body.visibleLimit, null);
  assert.equal(res.body.runs.length, 7);
  assert.equal(res.body.lockedCount, 0);
  const run = await history('free1', { id: lockedId() });
  assert.equal(run.statusCode, 200);
  assert.ok(run.body.run.cv);
});

await check('paid runs keep being saved', async () => {
  await optimize('free1');
  assert.equal(runIds('free1').length, 8);
  assert.equal((await history('free1')).body.runs.length, 8);
});

await check('cancelling locks older runs again without deleting them', async () => {
  setPlan('free1', 'free');
  const res = await history('free1');
  assert.equal(res.body.runs.length, 5);
  assert.equal(res.body.lockedCount, 3);
  assert.equal(runIds('free1').length, 8);
});

await check('comped account sees everything', async () => {
  for (let i = 0; i < 7; i += 1) await optimize('comped');
  const res = await history('comped');
  assert.equal(res.body.visibleLimit, null);
  assert.equal(res.body.runs.length, 7);
  assert.equal(res.body.lockedCount, 0);
});

await check('profile and history limits in the entitlement', async () => {
  const free = getEntitlement({ uid: 'x' }, {});
  const paid = getEntitlement({ uid: 'x' }, { plan: 'paid' });
  const comped = getEntitlement({ uid: 'x', email: 'comped@example.com' }, {});
  assert.deepEqual([free.profileLimit, free.historyVisible], [1, 5]);
  assert.deepEqual([paid.profileLimit, paid.historyVisible], [3, null]);
  assert.deepEqual([comped.profileLimit, comped.historyVisible], [10, null]);
});

await check('enforced: a refused free run is not saved', async () => {
  process.env.BILLING_ENFORCED = 'true';
  try {
    for (let i = 0; i < 5; i += 1) assert.equal((await optimize('free3')).statusCode, 200);
    const res = await optimize('free3');
    assert.equal(res.statusCode, 402);
    assert.equal(runIds('free3').length, 5);
    assert.equal((await getUserDoc('free3')).lifetimeUsage.optimizations, 5);
  } finally {
    delete process.env.BILLING_ENFORCED;
  }
});

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
