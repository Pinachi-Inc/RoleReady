// End-to-end checks for saved history, plan limits, Polar billing and complimentary
// Max, run against the real handlers with an in-memory Firestore, locally signed Firebase
// tokens, a stubbed model and a stubbed Polar API (see loader.mjs and fake-axios.mjs).
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/history.test.mjs
//
// The history checks write plans to the user document directly; the billing checks go through
// checkout and the signed webhook the way production does.

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'https://model.invalid/v1';
process.env.OPENAI_MODEL = 'test/default-model';
process.env.UNLIMITED_EMAILS = 'comped@example.com';
process.env.POLAR_ACCESS_TOKEN = 'polar_test_token';
process.env.POLAR_SERVER = 'sandbox';
process.env.POLAR_PRODUCT_ID_PRO = 'prod_pro';
process.env.POLAR_PRODUCT_ID_MAX = 'prod_max';
process.env.POLAR_WEBHOOK_SECRET = 'whsec_cm9sZWJlcnJ5LXRlc3Qtc2lnbmluZy1rZXktMzJieXQ=';
process.env.APP_URL = 'https://roleberry.test';
delete process.env.BILLING_ENFORCED;
delete process.env.MAX_MONTHLY_RUNS;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleOptimizeRequest } = await import('../../server/core/optimizeHandler.js');
const { handleHistory } = await import('../../server/core/historyHandler.js');
const { getEntitlement, getUserDoc } = await import('../../server/core/firestore.js');
const { handleCreateCheckout, handleBillingStatus, handleBillingWebhook, handleCustomerPortal } = await import('../../server/core/billing.js');
const fs = globalThis.__E2E_FS;
const polar = globalThis.__E2E_POLAR;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
// Defaults to a Google sign-in with a verified email, like most real users.
function token(uid, email, { verified = true, provider = 'google.com' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64url({
    sub: uid, email, email_verified: verified, firebase: { sign_in_provider: provider },
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600,
  });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function call(handler, uid, body = {}, { auth = true, email = `${uid}@example.com`, verified, provider } = {}) {
  const req = { headers: auth ? { authorization: `Bearer ${token(uid, email, { verified, provider })}` } : {}, body };
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

await check('the list reads metadata only from Firestore, over REST', async () => {
  await history('free1');
  const fields = globalThis.__E2E_HISTORY_SELECT;
  assert.ok(Array.isArray(fields), 'history list query uses select()');
  assert.ok(!fields.includes('cv') && !fields.includes('coverLetter'), 'CV bodies are not fetched');
  assert.equal(globalThis.__E2E_FS_SETTINGS?.preferRest, true);
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

await check('a run can be renamed by the id the optimize response carries', async () => {
  const made = await optimize('rename1');
  assert.equal(made.statusCode, 200);
  const { runId } = made.body;
  assert.ok(runId, 'optimize response has runId');
  assert.deepEqual(runIds('rename1'), [`users/rename1/history/${runId}`], 'run stored under that id');
  const stored = fs.get(`users/rename1/history/${runId}`);
  const res = await history('rename1', { id: runId, companyName: '  Acme   Corp  ' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.companyName, 'Acme Corp');
  const list = await history('rename1');
  assert.equal(list.body.runs[0].companyName, 'Acme Corp');
  const after = fs.get(`users/rename1/history/${runId}`);
  assert.equal(after.jobTitle, stored.jobTitle, 'other fields untouched');
  assert.deepEqual(after.cv, stored.cv, 'CV untouched');
  assert.equal((await history('rename1', { id: runId, companyName: '' })).body.companyName, '');
  assert.equal(fs.get(`users/rename1/history/${runId}`).companyName, null, 'blank clears it');
});

await check('rename: missing run is 404, bad input is 400, other users cannot reach it', async () => {
  const before = runIds('rename1').length;
  assert.equal((await history('rename1', { id: 'doesnotexist', companyName: 'X' })).statusCode, 404);
  assert.equal(runIds('rename1').length, before, 'a rename never creates a run');
  assert.equal((await history('rename1', { id: '../x', companyName: 'X' })).statusCode, 400);
  assert.equal((await history('rename1', { companyName: 'X' })).statusCode, 400);
  const id = runIds('rename1')[0].split('/').pop();
  assert.equal((await history('rename1', { id, companyName: 42 })).statusCode, 400);
  assert.equal((await history('someoneelse', { id, companyName: 'Hijack' })).statusCode, 404);
  assert.notEqual(fs.get(`users/rename1/history/${id}`).companyName, 'Hijack');
  const long = 'x'.repeat(200);
  assert.equal((await history('rename1', { id, companyName: long })).body.companyName.length, 80);
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
  assert.deepEqual([comped.plan, comped.profileLimit, comped.historyVisible, comped.limit], ['max', 100, null, 5000]);
  assert.equal(comped.unlimitedProfiles, true);
  assert.equal(free.extraTemplates, false);
  assert.equal(comped.extraTemplates, true);
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

out('\nmax plan and billing (Polar)');

const checkout = (uid, plan) => call(handleCreateCheckout, uid, plan === undefined ? {} : { plan });
const status = (uid) => call(handleBillingStatus, uid);
const portal = (uid) => call(handleCustomerPortal, uid);
const lastCheckout = () => polar.checkouts[polar.checkouts.length - 1];
const planOf = (uid) => fs.get(`users/${uid}`)?.plan;
const PRO = 'prod_pro';
const MAX = 'prod_max';
const DAY = 24 * 3600 * 1000;

// What Polar holds for a subscription: the REST API's subscription object.
function putSubscription(subId, product, statusValue = 'active', { endsAt = null, customer = 'cus_7000', cancelAtPeriodEnd = false } = {}) {
  polar.subs.set(String(subId), {
    id: String(subId),
    status: statusValue,
    customer_id: customer,
    product_id: product,
    current_period_start: '2029-12-01T00:00:00Z',
    current_period_end: '2030-01-01T00:00:00Z',
    cancel_at_period_end: cancelAtPeriodEnd,
    canceled_at: null,
    ends_at: endsAt,
    ended_at: null,
    metadata: {},
    customer: { id: customer, external_id: null, email: 'x@example.com' },
  });
}

// Standard Webhooks signature, as Polar sends it: HMAC-SHA256 base64 over
// `${id}.${timestamp}.${body}`. A `whsec_` secret's key is the base64-decoded rest of it.
function signPolar(raw, secret, id, ts) {
  const key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8');
  return `v1,${crypto.createHmac('sha256', key).update(`${id}.${ts}.`).update(raw).digest('base64')}`;
}

// A signed webhook delivery. `uid` goes in the subscription's metadata, as Polar copies the
// checkout's metadata onto the subscription. The payload body is deliberately thin: the handler
// re-reads the subscription from the API.
async function webhook(type, subId, { uid = null, payload = null, secret = process.env.POLAR_WEBHOOK_SECRET, ts = Math.floor(Date.now() / 1000), signatureHeader = null, id = `msg_${Math.random()}` } = {}) {
  if (uid && polar.subs.has(String(subId))) polar.subs.get(String(subId)).metadata = { user_id: uid };
  const event = {
    type,
    timestamp: new Date().toISOString(),
    data: payload || (type.startsWith('order.')
      ? { id: `ord_${Date.now()}`, subscription_id: subId ? String(subId) : null }
      : { id: String(subId) }),
  };
  const raw = Buffer.from(JSON.stringify(event));
  const sig = signatureHeader ?? signPolar(raw, secret, id, ts);
  const req = { headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig }, rawBody: raw };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleBillingWebhook(req, res);
  return res;
}

await check('status reports both plans as available', async () => {
  const res = await status('buyer');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.billingAvailable, true);
  assert.equal(res.body.maxAvailable, true);
  assert.equal(res.body.hasCustomer, false);
});

await check('checkout only accepts plan pro or max', async () => {
  for (const bad of [undefined, '', 'gold', 'paid', 'unlimited', '__proto__', 'toString', 42]) {
    const res = await checkout('buyer', bad);
    assert.equal(res.statusCode, 400, `plan=${String(bad)}`);
  }
  assert.equal(polar.checkouts.length, 0, 'no checkout created for a bad plan');
});

await check('max checkout: Max product, uid in metadata, email prefilled', async () => {
  const res = await checkout('buyer', 'max');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(res.body.url, /^https:\/\/sandbox-api\.polar\.sh\/checkout\//);
  const sent = lastCheckout();
  assert.equal(sent.base, 'https://sandbox-api.polar.sh/v1/checkouts/');
  assert.deepEqual(sent.products, [MAX]);
  assert.equal(sent.external_customer_id, 'buyer');
  assert.deepEqual(sent.metadata, { user_id: 'buyer', plan: 'max' });
  assert.equal(sent.customer_email, 'buyer@example.com');
  assert.equal(sent.success_url, 'https://roleberry.test/?checkout=success');
  assert.equal(sent.auth, 'Bearer polar_test_token');
  assert.equal(planOf('buyer'), undefined, 'checkout itself grants nothing');
});

await check('pro checkout uses the Pro product', async () => {
  assert.equal((await checkout('buyer', 'pro')).statusCode, 200);
  assert.deepEqual(lastCheckout().products, [PRO]);
});

await check('max checkout is unavailable without POLAR_PRODUCT_ID_MAX', async () => {
  const saved = process.env.POLAR_PRODUCT_ID_MAX;
  delete process.env.POLAR_PRODUCT_ID_MAX;
  try {
    assert.equal((await checkout('buyer', 'max')).statusCode, 503);
    assert.equal((await status('buyer')).body.maxAvailable, false);
    assert.equal((await checkout('buyer', 'pro')).statusCode, 200, 'pro still works');
  } finally {
    process.env.POLAR_PRODUCT_ID_MAX = saved;
  }
});

await check('webhook with a bad or missing signature is rejected and changes nothing', async () => {
  putSubscription(5001, MAX);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', signatureHeader: 'forged' })).statusCode, 400);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', signatureHeader: '' })).statusCode, 400);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', secret: 'not-the-secret' })).statusCode, 400);
  assert.equal(planOf('buyer'), undefined);
});

await check('a timestamp 10 minutes old is rejected, one a minute old is fine', async () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', ts: now - 600 })).statusCode, 400);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', ts: now + 600 })).statusCode, 400);
  assert.equal(planOf('buyer'), undefined);
  assert.equal((await webhook('subscription.created', 5001, { uid: 'buyer', ts: now - 60 })).statusCode, 200);
  assert.equal(planOf('buyer'), 'max');
  fs.delete('users/buyer');
});

await check('a signature header with two entries is accepted when the second is valid', async () => {
  const id = 'msg_multi';
  const ts = Math.floor(Date.now() / 1000);
  const raw = Buffer.from(JSON.stringify({ type: 'subscription.created', timestamp: new Date().toISOString(), data: { id: '5001' } }));
  const good = signPolar(raw, process.env.POLAR_WEBHOOK_SECRET, id, ts);
  const bad = signPolar(raw, 'rotated-out-secret', id, ts);
  polar.subs.get('5001').metadata = { user_id: 'buyer' };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleBillingWebhook({ headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `${bad} ${good}` }, rawBody: raw }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(planOf('buyer'), 'max');
  fs.delete('users/buyer');
});

await check('a secret made before 8 September 2026 (UTF-8 key of the whole whsec_ string) still verifies', async () => {
  const id = 'msg_legacy';
  const ts = Math.floor(Date.now() / 1000);
  const raw = Buffer.from(JSON.stringify({ type: 'subscription.created', timestamp: new Date().toISOString(), data: { id: '5001' } }));
  const legacy = `v1,${crypto.createHmac('sha256', Buffer.from(process.env.POLAR_WEBHOOK_SECRET, 'utf8')).update(`${id}.${ts}.`).update(raw).digest('base64')}`;
  polar.subs.get('5001').metadata = { user_id: 'buyer' };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleBillingWebhook({ headers: { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': legacy }, rawBody: raw }, res);
  assert.equal(res.statusCode, 200);
  fs.delete('users/buyer');
});

await check('subscription.created maps the Max product to plan max', async () => {
  const res = await webhook('subscription.created', 5001, { uid: 'buyer' });
  assert.equal(res.statusCode, 200);
  const doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'max');
  assert.equal(doc.billingSubscriptionId, '5001');
  assert.equal(doc.billingCustomerId, 'cus_7000');
  assert.equal(doc.subscriptionStatus, 'active');
  assert.equal((await status('buyer')).body.hasCustomer, true);
});

await check('the Pro product maps to Pro (stored as paid)', async () => {
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002' });
  await webhook('subscription.created', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('the event payload is not trusted: the live product decides', async () => {
  const lie = { id: '5002', product_id: MAX, status: 'active' };
  await webhook('subscription.updated', 5002, { uid: 'probuyer', payload: lie });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('an account is found by external customer id when metadata is missing', async () => {
  putSubscription(5010, PRO, 'active', { customer: 'cus_7010' });
  polar.subs.get('5010').customer.external_id = 'extuser';
  await webhook('subscription.created', 5010);
  assert.equal(planOf('extuser'), 'paid');
  fs.delete('users/extuser');
});

await check('order.paid resolves its subscription_id; events without metadata find the account by subscription id', async () => {
  putSubscription(5002, PRO, 'past_due', { customer: 'cus_7002' });
  await webhook('subscription.updated', 5002);
  assert.equal(fs.get('users/probuyer').subscriptionStatus, 'past_due');
  assert.equal(planOf('probuyer'), 'paid', 'past_due keeps access during retries');
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002' });
  const res = await webhook('order.paid', 5002);
  assert.equal(res.statusCode, 200);
  assert.equal(fs.get('users/probuyer').subscriptionStatus, 'active');
});

await check('an order without a subscription is acknowledged and ignored', async () => {
  const res = await webhook('order.paid', null);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { received: true });
});

await check('subscriber asking for the same plan is sent to the portal; comped has nothing to buy', async () => {
  const before = polar.checkouts.length;
  const same = await checkout('probuyer', 'pro');
  assert.equal(same.statusCode, 409);
  assert.equal(same.body.code, 'use_portal');
  const comped = await checkout('comped', 'max');
  assert.equal(comped.statusCode, 409);
  assert.notEqual(comped.body.code, 'use_portal');
  assert.equal(polar.checkouts.length, before, 'no second checkout');
});

await check('Pro to Max: the subscription product is changed in place and the plan follows', async () => {
  const before = polar.checkouts.length;
  const res = await checkout('probuyer', 'max');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { switched: 'max' });
  const patch = polar.patches[polar.patches.length - 1];
  assert.equal(patch.id, '5002');
  assert.deepEqual(patch.body, { product_id: MAX, proration_behavior: 'invoice' });
  assert.equal(polar.checkouts.length, before, 'no second subscription');
  assert.equal(planOf('probuyer'), 'max');
  // The webhook Polar sends after the change agrees.
  await webhook('subscription.updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'max');
});

await check('Max to Pro switches back', async () => {
  assert.deepEqual((await checkout('probuyer', 'pro')).body, { switched: 'pro' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('a switch made in the portal lands through subscription.updated', async () => {
  putSubscription(5002, MAX, 'active', { customer: 'cus_7002' });
  await webhook('subscription.updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'max');
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002' });
  await webhook('subscription.updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('an unknown product on a live subscription counts as Pro', async () => {
  putSubscription(5002, 'prod_old', 'active', { customer: 'cus_7002' });
  await webhook('subscription.updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002' });
});

await check('manage subscription opens a fresh customer portal session', async () => {
  const before = polar.sessions.length;
  const res = await portal('probuyer');
  assert.equal(res.statusCode, 200);
  assert.match(res.body.url, /^https:\/\/polar\.sh\/roleberry\/portal\?session=/);
  const session = polar.sessions[polar.sessions.length - 1];
  assert.equal(polar.sessions.length, before + 1);
  assert.equal(session.customer_id, 'cus_7002');
  assert.equal(session.return_url, 'https://roleberry.test/');
  assert.equal((await portal('nobodyhere')).statusCode, 404);
});

await check('a scheduled cancel keeps the plan and sets cancelAtPeriodEnd; uncancel clears it', async () => {
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002', cancelAtPeriodEnd: true, endsAt: '2030-01-01T00:00:00Z' });
  await webhook('subscription.updated', 5002, { uid: 'probuyer' });
  let doc = fs.get('users/probuyer');
  assert.equal(doc.plan, 'paid');
  assert.equal(doc.cancelAtPeriodEnd, true);
  assert.equal(doc.subscriptionStatus, 'active');
  assert.equal(doc.planRenewsAt, '2030-01-01T00:00:00Z');
  putSubscription(5002, PRO, 'active', { customer: 'cus_7002' });
  await webhook('subscription.uncanceled', 5002, { uid: 'probuyer' });
  doc = fs.get('users/probuyer');
  assert.equal(doc.cancelAtPeriodEnd, false);
  assert.equal(doc.planRenewsAt, '2030-01-01T00:00:00Z');
});

await check('canceled keeps Max until ends_at, then drops to free', async () => {
  putSubscription(5001, MAX, 'canceled', { endsAt: new Date(Date.now() + 10 * DAY).toISOString() });
  await webhook('subscription.canceled', 5001, { uid: 'buyer' });
  let doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'max');
  assert.equal(doc.cancelAtPeriodEnd, true);
  assert.ok(doc.planRenewsAt, 'shows when access ends');
  putSubscription(5001, MAX, 'active');
  await webhook('subscription.uncanceled', 5001, { uid: 'buyer' });
  assert.equal(fs.get('users/buyer').cancelAtPeriodEnd, false);
  putSubscription(5001, MAX, 'canceled', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription.updated', 5001, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'free', 'past ends_at means no access even before revoked arrives');
  putSubscription(5001, MAX, 'canceled', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription.revoked', 5001, { uid: 'buyer' });
  doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'free');
  assert.equal(doc.subscriptionStatus, 'canceled');
});

await check('incomplete and unpaid have no access; active restores it', async () => {
  for (const [event, st, plan] of [['subscription.updated', 'unpaid', 'free'], ['subscription.active', 'active', 'max'], ['subscription.updated', 'incomplete', 'free']]) {
    putSubscription(5001, MAX, st);
    await webhook(event, 5001, { uid: 'buyer' });
    assert.equal(planOf('buyer'), plan, `${event} -> ${st}`);
  }
});

await check('a late event about an old subscription does not downgrade a new one', async () => {
  putSubscription(5003, MAX, 'active');
  await webhook('subscription.created', 5003, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'max');
  putSubscription(5001, MAX, 'canceled', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription.revoked', 5001, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'max');
  assert.equal(fs.get('users/buyer').billingSubscriptionId, '5003');
});

await check('events that are not about subscriptions are acknowledged and ignored', async () => {
  const res = await webhook('customer.created', 0, { payload: { id: 'cus_1' } });
  assert.equal(res.statusCode, 200);
});

await check('Max limits: unlimited profiles (100 hidden), full history, fair-use runs', async () => {
  const max = getEntitlement({ uid: 'x' }, { plan: 'max' });
  assert.equal(max.profileLimit, 100);
  assert.equal(max.unlimitedProfiles, true);
  assert.equal(max.extraTemplates, true);
  assert.equal(max.historyVisible, null);
  assert.equal(max.fairUse, true);
  assert.equal(max.limit, 5000, 'default fair-use cap');
  assert.equal(max.window, 'month');
  process.env.MAX_MONTHLY_RUNS = '250';
  try {
    assert.equal(getEntitlement({ uid: 'x' }, { plan: 'max' }).limit, 250);
  } finally {
    delete process.env.MAX_MONTHLY_RUNS;
  }
  const pro = getEntitlement({ uid: 'x' }, { plan: 'paid' });
  assert.equal(pro.unlimitedProfiles, false);
  assert.equal(pro.extraTemplates, false);
  assert.equal(pro.fairUse, false);
});

await check('Max sees its full history', async () => {
  setPlan('free1', 'max');
  const res = await history('free1');
  assert.equal(res.body.visibleLimit, null);
  assert.equal(res.body.lockedCount, 0);
  assert.equal(res.body.runs.length, runIds('free1').length);
});

await check('enforced: Max is refused past its fair-use cap, with a fair-use message', async () => {
  process.env.BILLING_ENFORCED = 'true';
  process.env.MAX_MONTHLY_RUNS = '3';
  try {
    setPlan('maxuser', 'max');
    for (let i = 0; i < 3; i += 1) assert.equal((await optimize('maxuser')).statusCode, 200);
    const res = await optimize('maxuser');
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.code, 'upgrade_required');
    assert.match(res.body.error, /fair-use limit of 3/);
    assert.equal(runIds('maxuser').length, 3);
  } finally {
    delete process.env.BILLING_ENFORCED;
    delete process.env.MAX_MONTHLY_RUNS;
  }
});

await check('every plan runs on the same model', async () => {
  for (const uid of ['free2', 'probuyer', 'maxmodel', 'comped']) {
    if (uid === 'maxmodel') setPlan(uid, 'max');
    globalThis.__E2E_LAST_MODEL = null;
    assert.equal((await optimize(uid)).statusCode, 200);
    assert.equal(globalThis.__E2E_LAST_MODEL, 'test/default-model', uid);
  }
});

out('\ncomplimentary Max');

const { grantComp, revokeComp, listComps } = await import('../../server/core/comp.js');
const auth = globalThis.__E2E_AUTH;
const ent = async (uid) => (await status(uid)).body;
const signUp = (uid) => auth.set(`${uid}@example.com`, uid);

await check('allowlist (COMP_MAX_EMAILS, any case) grants Max and mirrors it for the rules', async () => {
  process.env.COMP_MAX_EMAILS = ' Friend@Example.COM , other@example.com';
  try {
    const s = await ent('friend');
    assert.equal(s.plan, 'max');
    assert.equal(s.comped, true);
    assert.equal(s.unlimitedProfiles, true);
    assert.equal(s.profileLimit, 100);
    assert.equal(fs.get('users/friend').compedEnv, true, 'mirrored for firestore.rules');
    assert.equal(fs.get('users/friend').plan, undefined, 'plan is left to billing');
  } finally {
    delete process.env.COMP_MAX_EMAILS;
  }
});

await check('taking an email off the allowlist takes Max and the mirror away', async () => {
  const s = await ent('friend');
  assert.equal(s.plan, 'free');
  assert.equal(s.comped, false);
  assert.equal(fs.get('users/friend').compedEnv, false);
});

await check('allowlisted account sees full history and cannot check out', async () => {
  process.env.COMP_MAX_EMAILS = 'friend@example.com';
  try {
    for (let i = 0; i < 7; i += 1) await optimize('friend');
    const h = await history('friend');
    assert.equal(h.body.visibleLimit, null);
    assert.equal(h.body.runs.length, 7);
    const c = await checkout('friend', 'max');
    assert.equal(c.statusCode, 409);
    assert.notEqual(c.body.code, 'use_portal');
  } finally {
    delete process.env.COMP_MAX_EMAILS;
  }
});

await check('script grant gives Max by email (case-insensitive)', async () => {
  signUp('pal');
  const r = await grantComp('  PAL@example.com ');
  assert.equal(r.uid, 'pal');
  const doc = fs.get('users/pal');
  assert.equal(doc.comped, true);
  assert.equal(doc.compedEmail, 'pal@example.com');
  const s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.billingPlan], ['max', true, 'free']);
});

await check('script refuses bad emails and people who never signed in', async () => {
  await assert.rejects(grantComp('not-an-email'), /Not an email/);
  await assert.rejects(grantComp('stranger@example.com'), /has not signed in/);
  await assert.rejects(revokeComp('stranger@example.com'), /has not signed in/);
});

await check('script list shows grants and the allowlist', async () => {
  process.env.COMP_MAX_EMAILS = 'friend@example.com';
  try {
    const { granted, allowlist } = await listComps();
    assert.ok(granted.some((g) => g.uid === 'pal' && g.email === 'pal@example.com'));
    assert.deepEqual(allowlist, ['friend@example.com']);
  } finally {
    delete process.env.COMP_MAX_EMAILS;
  }
});

await check('webhook leaves a comped account on Max whatever Polar says', async () => {
  assert.equal((await checkout('pal', 'pro')).statusCode, 409, 'comped cannot start a checkout');
  // A friend who already paid before being comped: Polar still has their Pro subscription.
  putSubscription(6001, PRO, 'active', { customer: 'cus_7601' });
  await webhook('subscription.updated', 6001, { uid: 'pal' });
  assert.equal(fs.get('users/pal').plan, 'paid', 'plan records Polar');
  assert.equal(fs.get('users/pal').comped, true);
  let s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.billingPlan], ['max', true, 'paid']);
  putSubscription(6001, PRO, 'canceled', { customer: 'cus_7601', endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription.revoked', 6001, { uid: 'pal' });
  s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.billingPlan], ['max', true, 'free'], 'the subscription ending does not end the comp');
});

await check('revoke falls back to the Polar plan, and keeps all data', async () => {
  putSubscription(6001, PRO, 'active', { customer: 'cus_7601' });
  for (let i = 0; i < 2; i += 1) await optimize('pal');
  const before = { runs: runIds('pal').length, usage: fs.get('users/pal').lifetimeUsage.optimizations };
  const r = await revokeComp('pal@example.com');
  assert.equal(r.plan, 'paid', 're-read from Polar');
  const doc = fs.get('users/pal');
  assert.equal('comped' in doc, false, 'flag removed, not set false');
  assert.equal(doc.plan, 'paid');
  assert.equal((await ent('pal')).plan, 'paid');
  assert.equal(runIds('pal').length, before.runs);
  assert.equal(doc.lifetimeUsage.optimizations, before.usage);
});

await check('revoke with no subscription lands on free', async () => {
  signUp('buddy');
  await grantComp('buddy@example.com');
  assert.equal((await ent('buddy')).plan, 'max');
  const r = await revokeComp('buddy@example.com');
  assert.equal(r.plan, 'free');
  assert.equal((await ent('buddy')).plan, 'free');
});

await check('revoke warns when the email is still allowlisted', async () => {
  signUp('friend');
  process.env.COMP_MAX_EMAILS = 'friend@example.com';
  try {
    await grantComp('friend@example.com');
    const r = await revokeComp('friend@example.com');
    assert.equal(r.stillAllowlisted, true);
    assert.equal((await ent('friend')).plan, 'max');
  } finally {
    delete process.env.COMP_MAX_EMAILS;
  }
});

await check('old plan: unlimited still counts as comped; webhook converts it, revoke ends it', async () => {
  signUp('legacy');
  fs.set('users/legacy', { plan: 'unlimited' });
  assert.deepEqual([(await ent('legacy')).plan, (await ent('legacy')).comped], ['max', true]);
  putSubscription(6002, MAX, 'active', { customer: 'cus_7602' });
  await webhook('subscription.created', 6002, { uid: 'legacy' });
  assert.equal(fs.get('users/legacy').plan, 'max');
  assert.equal(fs.get('users/legacy').comped, true, 'converted to the flag');
  putSubscription(6002, MAX, 'canceled', { customer: 'cus_7602', endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription.revoked', 6002, { uid: 'legacy' });
  assert.equal((await ent('legacy')).plan, 'max', 'still comped after cancelling');
  await revokeComp('legacy@example.com');
  assert.equal((await ent('legacy')).plan, 'free');
});

await check('enforced: comped accounts hit the same fair-use cap as Max', async () => {
  process.env.BILLING_ENFORCED = 'true';
  process.env.MAX_MONTHLY_RUNS = '2';
  process.env.COMP_MAX_EMAILS = 'capped@example.com';
  signUp('scripted');
  await grantComp('scripted@example.com');
  try {
    for (const uid of ['capped', 'scripted']) {
      for (let i = 0; i < 2; i += 1) assert.equal((await optimize(uid)).statusCode, 200, uid);
      const res = await optimize(uid);
      assert.equal(res.statusCode, 402, uid);
      assert.match(res.body.error, /fair-use limit of 2/);
      assert.equal(res.body.quota.plan, 'max');
    }
  } finally {
    delete process.env.BILLING_ENFORCED;
    delete process.env.MAX_MONTHLY_RUNS;
    delete process.env.COMP_MAX_EMAILS;
  }
});

out('\nunverified emails');

await check('password account with an unverified email is refused with 403', async () => {
  const res = await call(handleHistory, 'unverified1', {}, { verified: false, provider: 'password' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'email_unverified');
  const run = await call(handleOptimizeRequest, 'unverified1', { jobDescription: 'Platform role', aiUserInfo: '{"experienceSource":[]}' }, { verified: false, provider: 'password' });
  assert.equal(run.statusCode, 403);
});

await check('password account works once its email is verified', async () => {
  const res = await call(handleHistory, 'verified1', {}, { verified: true, provider: 'password' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
});

await check('unverified email does not inherit a comp granted to that address', async () => {
  process.env.COMP_MAX_EMAILS = 'vip@example.com';
  try {
    // Someone else's GitHub account claiming the comped address, not verified.
    const squatter = await call(handleBillingStatus, 'squatter', {}, { email: 'vip@example.com', verified: false, provider: 'github.com' });
    assert.equal(squatter.statusCode, 200, JSON.stringify(squatter.body));
    assert.equal(squatter.body.plan, 'free');
    // The real owner, verified, still gets Max.
    const owner = await call(handleBillingStatus, 'vip', {}, { email: 'vip@example.com' });
    assert.equal(owner.body.plan, 'max');
  } finally {
    delete process.env.COMP_MAX_EMAILS;
  }
});

out('\nGitHub email check');

const { handleGithubVerify } = await import('../../server/core/githubVerifyHandler.js');
const authRecords = globalThis.__E2E_AUTH_RECORDS;
globalThis.__E2E_GITHUB = {
  gho_owner: { id: 101, emails: [{ email: 'Gh@Example.com', verified: true }] },
  gho_unverified: { id: 202, emails: [{ email: 'ghu@example.com', verified: false }] },
  gho_stranger: { id: 999, emails: [{ email: 'gh@example.com', verified: true }] },
};
const githubUser = (uid, email, githubId) => authRecords.set(uid, {
  uid, email, emailVerified: false, providerData: [{ providerId: 'github.com', uid: String(githubId) }],
});
const ghVerify = (uid, email, accessToken) => call(handleGithubVerify, uid, { accessToken }, { email, verified: false, provider: 'github.com' });

await check('GitHub-verified email is marked verified in Firebase', async () => {
  githubUser('gh', 'gh@example.com', 101);
  const res = await ghVerify('gh', 'gh@example.com', 'gho_owner');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.verified, true);
  assert.equal(authRecords.get('gh').emailVerified, true);
});

await check('address GitHub has not verified stays unverified', async () => {
  githubUser('ghu', 'ghu@example.com', 202);
  const res = await ghVerify('ghu', 'ghu@example.com', 'gho_unverified');
  assert.equal(res.body.verified, false);
  assert.equal(authRecords.get('ghu').emailVerified, false);
});

await check('a token from a different GitHub account is refused', async () => {
  githubUser('gh2', 'gh@example.com', 101);
  const res = await ghVerify('gh2', 'gh@example.com', 'gho_stranger');
  assert.equal(res.statusCode, 403);
  assert.equal(authRecords.get('gh2').emailVerified, false);
});

await check('bad GitHub token and missing token are refused', async () => {
  githubUser('gh3', 'gh3@example.com', 303);
  assert.equal((await ghVerify('gh3', 'gh3@example.com', 'gho_nope')).statusCode, 401);
  assert.equal((await ghVerify('gh3', 'gh3@example.com', '')).statusCode, 400);
  assert.equal(authRecords.get('gh3').emailVerified, false);
});

await check('account without GitHub linked is refused', async () => {
  authRecords.set('pw', { uid: 'pw', email: 'pw@example.com', emailVerified: false, providerData: [{ providerId: 'password', uid: 'pw@example.com' }] });
  const res = await call(handleGithubVerify, 'pw', { accessToken: 'gho_owner' }, { email: 'pw@example.com', verified: false, provider: 'google.com' });
  assert.equal(res.statusCode, 400);
  assert.equal(authRecords.get('pw').emailVerified, false);
});

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
