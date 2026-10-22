// End-to-end checks for the account emails (server/core/lifecycleEmails.js): welcome, the
// first-run reminder, out of free runs, and cancel feedback, plus unsubscribe, the cron and the
// preview. Run against the real handlers with an in-memory Firestore and a stubbed Brevo API.
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/lifecycle-emails.test.mjs

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.BREVO_API_KEY = 'test';
process.env.EMAIL_LINK_SECRET = 'test-secret';
process.env.CRON_SECRET = 'cron-test';
process.env.OPENAI_API_KEY = 'test';
process.env.OPENAI_BASE_URL = 'https://model.invalid/v1';
process.env.OPENAI_MODEL = 'test/default-model';
process.env.COMP_MAX_EMAILS = 'comped@example.com';
process.env.LEMONSQUEEZY_API_KEY = 'ls_test_key';
process.env.LEMONSQUEEZY_STORE_ID = '11';
process.env.LEMONSQUEEZY_VARIANT_ID_PRO = '101';
process.env.LEMONSQUEEZY_VARIANT_ID_MAX = '202';
process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'ls_webhook_secret';
process.env.APP_URL = 'https://roleberry.test';
delete process.env.BILLING_ENFORCED;
delete process.env.VERCEL_ENV;
delete process.env.LIFECYCLE_EMAILS_ENABLED;
delete process.env.FEEDBACK_TO_EMAIL;
delete process.env.LIFECYCLE_FROM_EMAIL;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleOptimizeRequest } = await import('../../server/core/optimizeHandler.js');
const { handleBillingStatus, handleBillingWebhook } = await import('../../server/core/billing.js');
const { handleEmailEndpoint, unsubscribeToken, unsubscribeUrl } = await import('../../server/core/lifecycleEmails.js');
const { deleteAccount } = await import('../../server/core/accounts.js');
const fs = globalThis.__E2E_FS;
const ls = globalThis.__E2E_LS;
const mail = globalThis.__E2E_MAIL;
const authRecords = globalThis.__E2E_AUTH_RECORDS;
const authByEmail = globalThis.__E2E_AUTH;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64url({
    sub: uid, email, email_verified: true, firebase: { sign_in_provider: 'google.com' },
    aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600,
  });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
}

async function call(handler, uid, body = {}) {
  const req = { headers: { authorization: `Bearer ${token(uid, `${uid}@example.com`)}` }, body };
  const res = fakeRes();
  await handler(req, res);
  return res;
}

const status = (uid) => call(handleBillingStatus, uid);
const optimize = (uid) => call(handleOptimizeRequest, uid, { jobDescription: 'Platform role', aiUserInfo: '{"experienceSource":[]}' });

async function endpoint(query, { method = 'GET', bearer = null } = {}) {
  const req = { method, url: `/api/email?${query}`, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} };
  const res = fakeRes();
  await handleEmailEndpoint(req, res);
  return res;
}

function seed(uid, ageMs, { verified = true } = {}) {
  const email = `${uid}@example.com`;
  authByEmail.set(email, uid);
  authRecords.set(uid, { uid, email, emailVerified: verified, metadata: { creationTime: new Date(Date.now() - ageMs).toUTCString() } });
}

function putSubscription(subId, variant, statusValue, endsAt) {
  ls.subs.set(String(subId), {
    type: 'subscriptions',
    id: String(subId),
    attributes: { store_id: 11, customer_id: 7000 + Number(subId), variant_id: Number(variant), status: statusValue, cancelled: statusValue === 'cancelled', renews_at: null, ends_at: endsAt, urls: {} },
  });
}

async function webhook(eventName, subId, uid) {
  const event = {
    meta: { event_name: eventName, custom_data: { user_id: uid } },
    data: { type: 'subscriptions', id: String(subId), attributes: {} },
  };
  const raw = Buffer.from(JSON.stringify(event));
  const sig = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
  const res = fakeRes();
  await handleBillingWebhook({ headers: { 'x-signature': sig }, rawBody: raw }, res);
  return res;
}

const emailState = (uid) => fs.get(`emailState/${uid}`);
const sentTo = (uid) => mail.filter((m) => m.body.to[0].email === `${uid}@example.com`);

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

out('account emails');

await check('disabled by default: nothing is sent and no emailState is written', async () => {
  seed('quiet', HOUR);
  assert.equal((await status('quiet')).statusCode, 200);
  assert.equal(mail.length, 0);
  assert.equal(emailState('quiet'), undefined);
});

process.env.LIFECYCLE_EMAILS_ENABLED = 'true';

await check('welcome: one email on the first status call, none on the second', async () => {
  seed('newbie', HOUR);
  assert.equal((await status('newbie')).statusCode, 200);
  assert.equal(mail.length, 1);
  const { body } = mail[0];
  assert.equal(body.to[0].email, 'newbie@example.com');
  assert.equal(body.sender.email, 'hello@roleberry.app');
  assert.equal(body.sender.name, 'Roleberry');
  assert.equal(body.replyTo.email, 'support@roleberry.app');
  assert.equal(body.subject, 'Welcome to Roleberry');
  const url = unsubscribeUrl('newbie');
  assert.equal(body.headers['List-Unsubscribe'], `<${url}>`);
  assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(body.textContent.includes(url), 'text has the unsubscribe URL');
  assert.ok(body.htmlContent.includes(url.replace(/&/g, '&amp;')), 'HTML has the unsubscribe URL');
  assert.ok(emailState('newbie').welcomeSentAt);
  await status('newbie');
  assert.equal(mail.length, 1);
});

await check('old account: no welcome, marked skipped, still none later', async () => {
  mail.length = 0;
  seed('veteran', 10 * DAY);
  await status('veteran');
  await status('veteran');
  assert.equal(mail.length, 0);
  assert.equal(emailState('veteran').welcomeSkipped, 'old_account');
});

await check('a Brevo failure does not break status and the welcome is retried', async () => {
  mail.length = 0;
  seed('retry', HOUR);
  globalThis.__E2E_MAIL_FAIL = true;
  const res = await status('retry');
  assert.equal(res.statusCode, 200);
  assert.equal(emailState('retry')?.welcomeSentAt, undefined);
  globalThis.__E2E_MAIL_FAIL = false;
  await status('retry');
  assert.equal(mail.length, 1);
  assert.ok(emailState('retry').welcomeSentAt);
});

await check('out of runs: sent only after the 5th successful run, never again', async () => {
  mail.length = 0;
  seed('runner', DAY * 4);
  for (let i = 0; i < 4; i += 1) assert.equal((await optimize('runner')).statusCode, 200);
  assert.equal(mail.length, 0);
  assert.equal((await optimize('runner')).statusCode, 200);
  assert.equal(sentTo('runner').length, 1);
  assert.equal(mail[0].body.subject, "You've used your 5 free runs");
  assert.ok(mail[0].body.textContent.includes('https://roleberry.test/?upgrade=pro'));
  assert.equal((await optimize('runner')).statusCode, 200);
  assert.equal(mail.length, 1);
});

await check('a failed 5th run sends no out-of-runs email', async () => {
  mail.length = 0;
  for (let i = 0; i < 4; i += 1) await optimize('failer');
  globalThis.__E2E_MODEL_FAIL = { status: 500 };
  const res = await optimize('failer');
  globalThis.__E2E_MODEL_FAIL = null;
  assert.ok(res.statusCode >= 400);
  assert.equal(mail.length, 0);
  assert.equal((await optimize('failer')).statusCode, 200);
  assert.equal(mail.length, 1);
});

await check('paid and comped accounts get no out-of-runs email', async () => {
  mail.length = 0;
  fs.set('users/payer', { plan: 'paid' });
  for (let i = 0; i < 6; i += 1) await optimize('payer');
  for (let i = 0; i < 6; i += 1) await call(handleOptimizeRequest, 'comped', { jobDescription: 'Platform role', aiUserInfo: '{"experienceSource":[]}' });
  assert.equal(mail.length, 0);
});

await check('nudge sweep: only the account that qualifies is emailed, once', async () => {
  mail.length = 0;
  const welcomed = { welcomeSentAt: '2026-10-20T00:00:00Z' };
  seed('nA', 50 * HOUR); fs.set('emailState/nA', { ...welcomed });
  seed('nB', 50 * HOUR); fs.set('emailState/nB', { ...welcomed }); fs.set('users/nB', { lifetimeUsage: { optimizations: 1 } });
  seed('nC', 10 * HOUR); fs.set('emailState/nC', { ...welcomed });
  seed('nD', 8 * DAY); fs.set('emailState/nD', { ...welcomed });
  seed('nE', 50 * HOUR); fs.set('emailState/nE', { ...welcomed, unsubscribedAt: '2026-10-21T00:00:00Z' });
  seed('nF', 50 * HOUR); fs.set('emailState/nF', {});
  seed('nG', 50 * HOUR); fs.set('emailState/nG', { ...welcomed }); fs.set('users/nG', { plan: 'paid' });
  const res = await endpoint('action=nudge', { bearer: 'cron-test' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sent, 1);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].body.to[0].email, 'nA@example.com');
  assert.equal(mail[0].body.subject, 'Your first tailored CV takes a minute');
  assert.ok(emailState('nA').nudgeSentAt);
  const again = await endpoint('action=nudge', { bearer: 'cron-test' });
  assert.equal(again.body.sent, 0);
  assert.equal(mail.length, 1);
});

await check('cron and preview refuse a missing or wrong bearer token', async () => {
  mail.length = 0;
  for (const action of ['nudge', 'preview']) {
    assert.equal((await endpoint(`action=${action}`)).statusCode, 401);
    assert.equal((await endpoint(`action=${action}`, { bearer: 'wrong' })).statusCode, 401);
  }
  assert.equal(mail.length, 0);
});

await check('cancel: one email with the end date, not repeated, not for other events', async () => {
  mail.length = 0;
  seed('leaver', 20 * DAY);
  putSubscription(7001, '101', 'cancelled', '2026-11-22T00:00:00.000000Z');
  assert.equal((await webhook('subscription_cancelled', 7001, 'leaver')).statusCode, 200);
  assert.equal(mail.length, 1);
  assert.equal(mail[0].body.subject, 'Can I ask why you cancelled?');
  assert.ok(mail[0].body.textContent.includes('November 22, 2026'));
  assert.ok(mail[0].body.textContent.includes('Roleberry Pro subscription'));
  await webhook('subscription_cancelled', 7001, 'leaver');
  await webhook('subscription_updated', 7001, 'leaver');
  assert.equal(mail.length, 1);
});

await check('unsubscribe: GET shows a form without unsubscribing, POST does, bad token is 400', async () => {
  const t = unsubscribeToken('quitter');
  const q = `action=unsubscribe&u=quitter&t=${t}`;
  const get = await endpoint(q);
  assert.equal(get.statusCode, 200);
  assert.ok(String(get.body).includes('<form'));
  assert.equal(get.headers['Cache-Control'], 'no-store');
  assert.equal(emailState('quitter'), undefined);
  assert.equal((await endpoint('action=unsubscribe&u=quitter&t=bad')).statusCode, 400);
  assert.equal((await endpoint('action=unsubscribe&u=quitter')).statusCode, 400);
  assert.equal(emailState('quitter'), undefined);
  const post = await endpoint(q, { method: 'POST' });
  assert.equal(post.statusCode, 200);
  assert.ok(emailState('quitter').unsubscribedAt);
});

await check('after unsubscribing, out-of-runs and cancel emails are not sent', async () => {
  mail.length = 0;
  seed('quitter', 20 * DAY);
  for (let i = 0; i < 5; i += 1) await optimize('quitter');
  putSubscription(7002, '101', 'cancelled', '2026-11-22T00:00:00.000000Z');
  await webhook('subscription_cancelled', 7002, 'quitter');
  assert.equal(mail.length, 0);
});

await check('preview: four emails to support, all marked, no state written', async () => {
  mail.length = 0;
  const before = [...fs.keys()].filter((k) => k.startsWith('emailState/')).length;
  const res = await endpoint('action=preview', { bearer: 'cron-test' });
  assert.equal(res.body.sent, 4);
  assert.equal(mail.length, 4);
  for (const m of mail) {
    assert.equal(m.body.to[0].email, 'support@roleberry.app');
    assert.ok(m.body.subject.startsWith('[Preview] '), m.body.subject);
  }
  assert.equal([...fs.keys()].filter((k) => k.startsWith('emailState/')).length, before);
  assert.equal(emailState('preview'), undefined);
});

await check('deleting an account removes its emailState', async () => {
  seed('goner', DAY);
  fs.set('users/goner', {});
  fs.set('emailState/goner', { welcomeSentAt: '2026-10-20T00:00:00Z' });
  await deleteAccount('goner');
  assert.equal(emailState('goner'), undefined);
});

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
