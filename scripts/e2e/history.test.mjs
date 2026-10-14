// End-to-end checks for saved history, plan limits and Stripe billing, run against the real
// handlers with an in-memory Firestore, locally signed Firebase tokens, a stubbed model and a
// stubbed Stripe SDK (see loader.mjs).
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/history.test.mjs
//
// The history checks write plans to the user document directly; the billing checks go through
// Checkout and the signed webhook the way production does.

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'https://model.invalid/v1';
process.env.OPENAI_MODEL = 'test/default-model';
process.env.UNLIMITED_EMAILS = 'comped@example.com';
process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e';
process.env.STRIPE_PRICE_ID = 'price_pro';
process.env.STRIPE_PRICE_ID_MAX = 'price_max';
process.env.APP_URL = 'https://roleberry.test';
delete process.env.BILLING_ENFORCED;
delete process.env.MAX_MONTHLY_RUNS;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleOptimizeRequest } = await import('../../server/core/optimizeHandler.js');
const { handleHistory } = await import('../../server/core/historyHandler.js');
const { getEntitlement, getUserDoc } = await import('../../server/core/firestore.js');
const { handleCreateCheckout, handleBillingStatus, handleStripeWebhook } = await import('../../server/core/billing.js');
const fs = globalThis.__E2E_FS;
const stripe = globalThis.__E2E_STRIPE;

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
  assert.deepEqual([comped.plan, comped.profileLimit, comped.historyVisible, comped.limit], ['max', 100, null, 5000]);
  assert.equal(comped.unlimitedProfiles, true);
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

out('\nmax plan and billing');

const checkout = (uid, plan) => call(handleCreateCheckout, uid, plan === undefined ? {} : { plan });
const status = (uid) => call(handleBillingStatus, uid);
const lastSession = () => stripe.sessions[stripe.sessions.length - 1];
const planOf = (uid) => fs.get(`users/${uid}`)?.plan;

async function webhook(type, object, signature = 'valid') {
  const event = { id: `evt_${type}_${Date.now()}`, type, data: { object } };
  const req = { headers: { 'stripe-signature': signature }, rawBody: Buffer.from(JSON.stringify(event)) };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await handleStripeWebhook(req, res);
  return res;
}

// What Stripe holds after a checkout or a portal change: one subscription with one price.
function putSubscription(uid, subId, priceId, statusValue = 'active') {
  const customer = fs.get(`users/${uid}`)?.stripeCustomerId || 'cus_unknown';
  stripe.subs.set(subId, {
    id: subId,
    customer,
    status: statusValue,
    cancel_at_period_end: false,
    metadata: { firebaseUid: uid },
    items: { data: [{ price: { id: priceId }, current_period_end: 1893456000 }] },
  });
}

await check('status reports both prices as available', async () => {
  const res = await status('buyer');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.billingAvailable, true);
  assert.equal(res.body.maxAvailable, true);
});

await check('checkout only accepts plan pro or max', async () => {
  for (const bad of [undefined, '', 'gold', 'paid', 'unlimited', '__proto__', 'toString', 42]) {
    const res = await checkout('buyer', bad);
    assert.equal(res.statusCode, 400, `plan=${String(bad)}`);
  }
  assert.equal(stripe.sessions.length, 0, 'no session created for a bad plan');
});

await check('max checkout uses the Max price', async () => {
  const res = await checkout('buyer', 'max');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.url);
  const s = lastSession();
  assert.deepEqual(s.line_items, [{ price: 'price_max', quantity: 1 }]);
  assert.equal(s.mode, 'subscription');
  assert.equal(s.metadata.plan, 'max');
  assert.equal(s.subscription_data.metadata.firebaseUid, 'buyer');
  assert.equal(planOf('buyer'), undefined, 'checkout itself grants nothing');
});

await check('pro checkout uses the Pro price', async () => {
  const res = await checkout('buyer', 'pro');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(lastSession().line_items, [{ price: 'price_pro', quantity: 1 }]);
});

await check('max checkout is unavailable without STRIPE_PRICE_ID_MAX', async () => {
  const saved = process.env.STRIPE_PRICE_ID_MAX;
  delete process.env.STRIPE_PRICE_ID_MAX;
  try {
    assert.equal((await checkout('buyer', 'max')).statusCode, 503);
    assert.equal((await status('buyer')).body.maxAvailable, false);
    assert.equal((await checkout('buyer', 'pro')).statusCode, 200, 'pro still works');
  } finally {
    process.env.STRIPE_PRICE_ID_MAX = saved;
  }
});

await check('webhook with a bad signature is rejected and changes nothing', async () => {
  putSubscription('buyer', 'sub_buyer', 'price_max');
  const res = await webhook('customer.subscription.created', { id: 'sub_buyer' }, 'forged');
  assert.equal(res.statusCode, 400);
  assert.equal(planOf('buyer'), undefined);
});

await check('webhook maps the Max price to plan max', async () => {
  const res = await webhook('checkout.session.completed', { mode: 'subscription', subscription: 'sub_buyer' });
  assert.equal(res.statusCode, 200);
  assert.equal(planOf('buyer'), 'max');
  assert.equal(fs.get('users/buyer').stripeSubscriptionId, 'sub_buyer');
});

await check('webhook maps the Pro price to Pro (stored as paid)', async () => {
  await checkout('probuyer', 'pro');
  putSubscription('probuyer', 'sub_pro', 'price_pro');
  await webhook('customer.subscription.created', { id: 'sub_pro' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('a subscriber is sent to the portal instead of a second checkout', async () => {
  const before = stripe.sessions.length;
  for (const plan of ['max', 'pro']) {
    const res = await checkout('probuyer', plan);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'use_portal');
  }
  const comped = await checkout('comped', 'max');
  assert.equal(comped.statusCode, 409);
  assert.notEqual(comped.body.code, 'use_portal', 'comped has nothing to manage');
  assert.equal(stripe.sessions.length, before);
});

await check('Pro to Max in the portal: subscription.updated moves the plan to max', async () => {
  putSubscription('probuyer', 'sub_pro', 'price_max');
  const res = await webhook('customer.subscription.updated', { id: 'sub_pro' });
  assert.equal(res.statusCode, 200);
  assert.equal(planOf('probuyer'), 'max');
  assert.equal((await status('probuyer')).body.plan, 'max');
});

await check('Max to Pro in the portal moves it back', async () => {
  putSubscription('probuyer', 'sub_pro', 'price_pro');
  await webhook('customer.subscription.updated', { id: 'sub_pro' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('the event payload is not trusted: the live price decides', async () => {
  putSubscription('probuyer', 'sub_pro', 'price_pro');
  await webhook('customer.subscription.updated', { id: 'sub_pro', items: { data: [{ price: { id: 'price_max' } }] } });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('an unknown price on a live subscription counts as Pro', async () => {
  putSubscription('probuyer', 'sub_pro', 'price_legacy');
  await webhook('customer.subscription.updated', { id: 'sub_pro' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('cancelling Max drops to free', async () => {
  putSubscription('buyer', 'sub_buyer', 'price_max', 'canceled');
  await webhook('customer.subscription.deleted', { id: 'sub_buyer' });
  assert.equal(planOf('buyer'), 'free');
});

await check('Max limits: unlimited profiles (100 hidden), full history, fair-use runs', async () => {
  const max = getEntitlement({ uid: 'x' }, { plan: 'max' });
  assert.equal(max.profileLimit, 100);
  assert.equal(max.unlimitedProfiles, true);
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
    assert.equal(fs.get('users/friend').plan, undefined, 'plan is left to Stripe');
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
  assert.deepEqual([s.plan, s.comped, s.stripePlan], ['max', true, 'free']);
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

await check('webhook leaves a comped account on Max whatever Stripe says', async () => {
  assert.equal((await checkout('pal', 'pro')).statusCode, 409, 'comped cannot start a checkout');
  // A friend who already paid before being comped: Stripe still has their Pro subscription.
  fs.set('users/pal', { ...fs.get('users/pal'), stripeCustomerId: 'cus_pal' });
  putSubscription('pal', 'sub_pal', 'price_pro');
  await webhook('customer.subscription.updated', { id: 'sub_pal' });
  assert.equal(fs.get('users/pal').plan, 'paid', 'plan records Stripe');
  assert.equal(fs.get('users/pal').comped, true);
  let s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.stripePlan], ['max', true, 'paid']);
  putSubscription('pal', 'sub_pal', 'price_pro', 'canceled');
  await webhook('customer.subscription.deleted', { id: 'sub_pal' });
  s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.stripePlan], ['max', true, 'free'], 'cancelling Stripe does not end the comp');
});

await check('revoke falls back to the Stripe plan, and keeps all data', async () => {
  putSubscription('pal', 'sub_pal', 'price_pro', 'active');
  for (let i = 0; i < 2; i += 1) await optimize('pal');
  const before = { runs: runIds('pal').length, usage: fs.get('users/pal').lifetimeUsage.optimizations };
  const r = await revokeComp('pal@example.com');
  assert.equal(r.plan, 'paid', 're-read from Stripe');
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
  fs.set('users/legacy', { plan: 'unlimited', stripeCustomerId: 'cus_legacy' });
  assert.deepEqual([(await ent('legacy')).plan, (await ent('legacy')).comped], ['max', true]);
  putSubscription('legacy', 'sub_legacy', 'price_max');
  await webhook('customer.subscription.created', { id: 'sub_legacy' });
  assert.equal(fs.get('users/legacy').plan, 'max');
  assert.equal(fs.get('users/legacy').comped, true, 'converted to the flag');
  putSubscription('legacy', 'sub_legacy', 'price_max', 'canceled');
  await webhook('customer.subscription.deleted', { id: 'sub_legacy' });
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

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
