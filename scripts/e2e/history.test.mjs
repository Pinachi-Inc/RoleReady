// End-to-end checks for saved history, plan limits, Lemon Squeezy billing and complimentary
// Max, run against the real handlers with an in-memory Firestore, locally signed Firebase
// tokens, a stubbed model and a stubbed Lemon Squeezy API (see loader.mjs and fake-axios.mjs).
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
process.env.LEMONSQUEEZY_API_KEY = 'ls_test_key';
process.env.LEMONSQUEEZY_STORE_ID = '11';
process.env.LEMONSQUEEZY_VARIANT_ID_PRO = '101';
process.env.LEMONSQUEEZY_VARIANT_ID_MAX = '202';
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'ls_webhook_secret';
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
const ls = globalThis.__E2E_LS;

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

out('\nmax plan and billing (Lemon Squeezy)');

const checkout = (uid, plan) => call(handleCreateCheckout, uid, plan === undefined ? {} : { plan });
const status = (uid) => call(handleBillingStatus, uid);
const portal = (uid) => call(handleCustomerPortal, uid);
const lastCheckout = () => ls.checkouts[ls.checkouts.length - 1];
const planOf = (uid) => fs.get(`users/${uid}`)?.plan;
const PRO = '101';
const MAX = '202';
const DAY = 24 * 3600 * 1000;

// What Lemon Squeezy holds for a subscription: the API's JSON:API object.
function putSubscription(subId, variant, statusValue = 'active', { endsAt = null, customer = 7000 } = {}) {
  ls.subs.set(String(subId), {
    type: 'subscriptions',
    id: String(subId),
    attributes: {
      store_id: 11,
      customer_id: customer,
      variant_id: Number(variant),
      status: statusValue,
      cancelled: statusValue === 'cancelled',
      renews_at: '2030-01-01T00:00:00.000000Z',
      ends_at: endsAt,
      urls: {
        customer_portal: `https://roleberry.lemonsqueezy.com/billing?sub=${subId}`,
        update_payment_method: `https://roleberry.lemonsqueezy.com/subscription/${subId}/payment-details`,
      },
    },
  });
}

// A signed webhook delivery. `uid` goes in meta.custom_data, as Lemon Squeezy echoes the
// checkout's custom data on that subscription's events. The payload body is deliberately thin:
// the handler re-reads the subscription from the API.
async function webhook(eventName, subId, { uid = null, signature = null, payload = null } = {}) {
  const invoice = eventName.startsWith('subscription_payment_');
  const event = {
    meta: { event_name: eventName, ...(uid ? { custom_data: { user_id: uid } } : {}) },
    data: payload || (invoice
      ? { type: 'subscription-invoices', id: `inv_${Date.now()}`, attributes: { subscription_id: Number(subId) } }
      : { type: 'subscriptions', id: String(subId), attributes: {} }),
  };
  const raw = Buffer.from(JSON.stringify(event));
  const sig = signature ?? crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
  const req = { headers: { 'x-signature': sig }, rawBody: raw };
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
  assert.equal(ls.checkouts.length, 0, 'no checkout created for a bad plan');
});

await check('max checkout: Max variant, store, uid in custom data, email prefilled', async () => {
  const res = await checkout('buyer', 'max');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.match(res.body.url, /^https:\/\/roleberry\.lemonsqueezy\.com\/checkout\//);
  const { data } = lastCheckout();
  assert.equal(data.type, 'checkouts');
  assert.equal(data.relationships.variant.data.id, MAX);
  assert.equal(data.relationships.store.data.id, '11');
  assert.deepEqual(data.attributes.checkout_data.custom, { user_id: 'buyer', plan: 'max' });
  assert.equal(data.attributes.checkout_data.email, 'buyer@example.com');
  assert.equal(data.attributes.product_options.redirect_url, 'https://roleberry.test/?checkout=success');
  assert.deepEqual(data.attributes.product_options.enabled_variants, [Number(MAX)]);
  assert.equal(lastCheckout().auth, 'Bearer ls_test_key');
  assert.equal(planOf('buyer'), undefined, 'checkout itself grants nothing');
});

await check('pro checkout uses the Pro variant', async () => {
  assert.equal((await checkout('buyer', 'pro')).statusCode, 200);
  assert.equal(lastCheckout().data.relationships.variant.data.id, PRO);
});

await check('max checkout is unavailable without LEMONSQUEEZY_VARIANT_ID_MAX', async () => {
  const saved = process.env.LEMONSQUEEZY_VARIANT_ID_MAX;
  delete process.env.LEMONSQUEEZY_VARIANT_ID_MAX;
  try {
    assert.equal((await checkout('buyer', 'max')).statusCode, 503);
    assert.equal((await status('buyer')).body.maxAvailable, false);
    assert.equal((await checkout('buyer', 'pro')).statusCode, 200, 'pro still works');
  } finally {
    process.env.LEMONSQUEEZY_VARIANT_ID_MAX = saved;
  }
});

await check('webhook with a bad or missing signature is rejected and changes nothing', async () => {
  putSubscription(5001, MAX);
  assert.equal((await webhook('subscription_created', 5001, { uid: 'buyer', signature: 'forged' })).statusCode, 400);
  assert.equal((await webhook('subscription_created', 5001, { uid: 'buyer', signature: '' })).statusCode, 400);
  const wrongKey = crypto.createHmac('sha256', 'not-the-secret').update('{}').digest('hex');
  assert.equal((await webhook('subscription_created', 5001, { uid: 'buyer', signature: wrongKey })).statusCode, 400);
  assert.equal(planOf('buyer'), undefined);
});

await check('subscription_created maps the Max variant to plan max', async () => {
  const res = await webhook('subscription_created', 5001, { uid: 'buyer' });
  assert.equal(res.statusCode, 200);
  const doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'max');
  assert.equal(doc.billingSubscriptionId, '5001');
  assert.equal(doc.billingCustomerId, '7000');
  assert.equal(doc.subscriptionStatus, 'active');
  assert.equal((await status('buyer')).body.hasCustomer, true);
});

await check('the Pro variant maps to Pro (stored as paid)', async () => {
  putSubscription(5002, PRO, 'active', { customer: 7002 });
  await webhook('subscription_created', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('the event payload is not trusted: the live variant decides', async () => {
  const lie = { type: 'subscriptions', id: '5002', attributes: { variant_id: Number(MAX), status: 'active' } };
  await webhook('subscription_updated', 5002, { uid: 'probuyer', payload: lie });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('events without custom data find the account by subscription id', async () => {
  putSubscription(5002, PRO, 'past_due', { customer: 7002 });
  await webhook('subscription_payment_failed', 5002);
  assert.equal(fs.get('users/probuyer').subscriptionStatus, 'past_due');
  assert.equal(planOf('probuyer'), 'paid', 'past_due keeps access during retries');
  putSubscription(5002, PRO, 'active', { customer: 7002 });
  await webhook('subscription_payment_recovered', 5002);
  assert.equal(fs.get('users/probuyer').subscriptionStatus, 'active');
});

await check('subscriber asking for the same plan is sent to the portal; comped has nothing to buy', async () => {
  const before = ls.checkouts.length;
  const same = await checkout('probuyer', 'pro');
  assert.equal(same.statusCode, 409);
  assert.equal(same.body.code, 'use_portal');
  const comped = await checkout('comped', 'max');
  assert.equal(comped.statusCode, 409);
  assert.notEqual(comped.body.code, 'use_portal');
  assert.equal(ls.checkouts.length, before, 'no second checkout');
});

await check('Pro to Max: the subscription variant is changed in place and the plan follows', async () => {
  const before = ls.checkouts.length;
  const res = await checkout('probuyer', 'max');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { switched: 'max' });
  const patch = ls.patches[ls.patches.length - 1];
  assert.equal(patch.id, '5002');
  assert.deepEqual(patch.body.data.attributes, { variant_id: Number(MAX) });
  assert.equal(ls.checkouts.length, before, 'no second subscription');
  assert.equal(planOf('probuyer'), 'max');
  // The webhook Lemon Squeezy sends after the change agrees.
  await webhook('subscription_updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'max');
});

await check('Max to Pro switches back', async () => {
  assert.deepEqual((await checkout('probuyer', 'pro')).body, { switched: 'pro' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('a switch made in the portal lands through subscription_updated', async () => {
  putSubscription(5002, MAX, 'active', { customer: 7002 });
  await webhook('subscription_plan_changed', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'max');
  putSubscription(5002, PRO, 'active', { customer: 7002 });
  await webhook('subscription_updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
});

await check('an unknown variant on a live subscription counts as Pro', async () => {
  putSubscription(5002, '999', 'active', { customer: 7002 });
  await webhook('subscription_updated', 5002, { uid: 'probuyer' });
  assert.equal(planOf('probuyer'), 'paid');
  putSubscription(5002, PRO, 'active', { customer: 7002 });
});

await check('manage subscription opens the subscription\'s customer portal link', async () => {
  const res = await portal('probuyer');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.url, 'https://roleberry.lemonsqueezy.com/billing?sub=5002');
  assert.equal((await portal('nobodyhere')).statusCode, 404);
});

await check('cancelled keeps Max until ends_at, then expired drops to free', async () => {
  putSubscription(5001, MAX, 'cancelled', { endsAt: new Date(Date.now() + 10 * DAY).toISOString() });
  await webhook('subscription_cancelled', 5001, { uid: 'buyer' });
  let doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'max');
  assert.equal(doc.cancelAtPeriodEnd, true);
  assert.ok(doc.planRenewsAt, 'shows when access ends');
  putSubscription(5001, MAX, 'active');
  await webhook('subscription_resumed', 5001, { uid: 'buyer' });
  assert.equal(fs.get('users/buyer').cancelAtPeriodEnd, false);
  putSubscription(5001, MAX, 'cancelled', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription_updated', 5001, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'free', 'past ends_at means no access even before expired arrives');
  putSubscription(5001, MAX, 'expired', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription_expired', 5001, { uid: 'buyer' });
  doc = fs.get('users/buyer');
  assert.equal(doc.plan, 'free');
  assert.equal(doc.subscriptionStatus, 'expired');
});

await check('paused and unpaid have no access; unpaused restores it', async () => {
  for (const [event, st, plan] of [['subscription_paused', 'paused', 'free'], ['subscription_unpaused', 'active', 'max'], ['subscription_payment_failed', 'unpaid', 'free']]) {
    putSubscription(5001, MAX, st);
    await webhook(event, 5001, { uid: 'buyer' });
    assert.equal(planOf('buyer'), plan, `${event} -> ${st}`);
  }
});

await check('a late event about an old subscription does not downgrade a new one', async () => {
  putSubscription(5003, MAX, 'active');
  await webhook('subscription_created', 5003, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'max');
  putSubscription(5001, MAX, 'expired', { endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription_expired', 5001, { uid: 'buyer' });
  assert.equal(planOf('buyer'), 'max');
  assert.equal(fs.get('users/buyer').billingSubscriptionId, '5003');
});

await check('events that are not about subscriptions are acknowledged and ignored', async () => {
  const res = await webhook('order_created', 0, { payload: { type: 'orders', id: '1', attributes: {} } });
  assert.equal(res.statusCode, 200);
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

await check('webhook leaves a comped account on Max whatever Lemon Squeezy says', async () => {
  assert.equal((await checkout('pal', 'pro')).statusCode, 409, 'comped cannot start a checkout');
  // A friend who already paid before being comped: Lemon Squeezy still has their Pro subscription.
  putSubscription(6001, PRO, 'active', { customer: 7601 });
  await webhook('subscription_updated', 6001, { uid: 'pal' });
  assert.equal(fs.get('users/pal').plan, 'paid', 'plan records Lemon Squeezy');
  assert.equal(fs.get('users/pal').comped, true);
  let s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.billingPlan], ['max', true, 'paid']);
  putSubscription(6001, PRO, 'expired', { customer: 7601, endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription_expired', 6001, { uid: 'pal' });
  s = await ent('pal');
  assert.deepEqual([s.plan, s.comped, s.billingPlan], ['max', true, 'free'], 'the subscription ending does not end the comp');
});

await check('revoke falls back to the Lemon Squeezy plan, and keeps all data', async () => {
  putSubscription(6001, PRO, 'active', { customer: 7601 });
  for (let i = 0; i < 2; i += 1) await optimize('pal');
  const before = { runs: runIds('pal').length, usage: fs.get('users/pal').lifetimeUsage.optimizations };
  const r = await revokeComp('pal@example.com');
  assert.equal(r.plan, 'paid', 're-read from Lemon Squeezy');
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
  putSubscription(6002, MAX, 'active', { customer: 7602 });
  await webhook('subscription_created', 6002, { uid: 'legacy' });
  assert.equal(fs.get('users/legacy').plan, 'max');
  assert.equal(fs.get('users/legacy').comped, true, 'converted to the flag');
  putSubscription(6002, MAX, 'expired', { customer: 7602, endsAt: new Date(Date.now() - DAY).toISOString() });
  await webhook('subscription_expired', 6002, { uid: 'legacy' });
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
