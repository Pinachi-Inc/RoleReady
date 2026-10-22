// Checks for the account admin tools behind `npm run users` (server/core/accounts.js): listing
// accounts, and deleting one with everything stored about it.
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/accounts.test.mjs

import assert from 'node:assert/strict';

process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'roleberry-e2e' });
process.env.LEMONSQUEEZY_API_KEY = 'ls_test_key';

const { listAccounts, resolveAccount, deleteAccount } = await import('../../server/core/accounts.js');
const fs = globalThis.__E2E_FS;
const authByEmail = globalThis.__E2E_AUTH;
const authRecords = globalThis.__E2E_AUTH_RECORDS;
const ls = globalThis.__E2E_LS;

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
  }
}

function seedAccount(uid, email, doc = {}, created = '2026-10-01T00:00:00Z') {
  authByEmail.set(email, uid);
  authRecords.set(uid, { uid, email, emailVerified: true, providerData: [{ providerId: 'google.com' }], metadata: { creationTime: created, lastSignInTime: created } });
  fs.set(`users/${uid}`, doc);
}

seedAccount('keep1', 'me@example.com', { plan: 'max', comped: true }, '2026-10-01T00:00:00Z');
seedAccount('payer', 'payer@example.com', { plan: 'paid', billingSubscriptionId: '900', subscriptionStatus: 'active' }, '2026-10-05T00:00:00Z');
seedAccount('tester', 'tester@example.com', {}, '2026-10-03T00:00:00Z');
fs.set('users/payer/history/r1', { cv: { summary: 'x' } });
fs.set('users/payer/history/r2', { cv: { summary: 'y' } });
fs.set('feedback/f1', { uid: 'payer', message: 'hi' });
fs.set('feedback/f1/attachments/a1', { data: 'png' });
fs.set('feedback/f2', { uid: 'tester', message: 'other' });
fs.set('feedbackLimits/uid_payer', { count: 1 });
ls.subs.set('900', { id: '900', attributes: { status: 'active', variant_id: 101 } });

await check('listAccounts joins Auth with the user document, newest first', async () => {
  const accounts = await listAccounts();
  assert.deepEqual(accounts.map((a) => a.uid), ['payer', 'tester', 'keep1']);
  const payer = accounts[0];
  assert.equal(payer.email, 'payer@example.com');
  assert.equal(payer.plan, 'paid');
  assert.equal(payer.subscriptionId, '900');
  assert.equal(accounts[2].comped, true);
  assert.equal(accounts[1].plan, 'free');
});

await check('resolveAccount finds by email or uid, null when missing', async () => {
  assert.equal((await resolveAccount('Payer@Example.com')).uid, 'payer');
  assert.equal((await resolveAccount('tester')).uid, 'tester');
  assert.equal(await resolveAccount('nobody@example.com'), null);
});

await check('deleteAccount cancels the subscription and removes every trace', async () => {
  const r = await deleteAccount('payer');
  assert.equal(r.subscription, 'cancelled');
  assert.equal(ls.subs.get('900').attributes.status, 'cancelled');
  assert.equal(r.feedbackReports, 1);
  assert.equal(r.auth, 'deleted');
  assert.ok(![...fs.keys()].some((k) => k.startsWith('users/payer')), 'user document and history gone');
  assert.ok(!fs.has('feedback/f1') && !fs.has('feedback/f1/attachments/a1'), 'feedback and attachment gone');
  assert.ok(!fs.has('feedbackLimits/uid_payer'), 'rate-limit counter gone');
  assert.ok(!authRecords.has('payer') && !authByEmail.has('payer@example.com'), 'auth account gone');
  assert.ok(fs.has('feedback/f2') && fs.has('users/tester') && fs.has('users/keep1'), 'other accounts untouched');
});

await check('a subscription the API key cannot see does not block deletion', async () => {
  fs.set('users/tester', { plan: 'paid', billingSubscriptionId: 'test-mode-1', subscriptionStatus: 'active' });
  const r = await deleteAccount('tester');
  assert.match(r.subscription, /not found/);
  assert.equal(r.auth, 'deleted');
  assert.ok(!fs.has('users/tester'));
});

out(`accounts: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
