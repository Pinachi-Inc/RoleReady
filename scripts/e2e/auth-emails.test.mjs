// End-to-end checks for our own verification and password-reset emails
// (server/core/authEmails.js), through the /api/email endpoint with an in-memory Firestore and
// Auth and a stubbed Brevo API.
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/auth-emails.test.mjs

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.BREVO_API_KEY = 'test';
process.env.CRON_SECRET = 'cron-test';
process.env.APP_URL = 'https://roleberry.test';
delete process.env.LIFECYCLE_EMAILS_ENABLED;
delete process.env.VERCEL_ENV;
delete process.env.EMAIL_LINK_SECRET;
delete process.env.FEEDBACK_TO_EMAIL;
delete process.env.LIFECYCLE_FROM_EMAIL;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleEmailEndpoint } = await import('../../server/core/lifecycleEmails.js');
const fs = globalThis.__E2E_FS;
const mail = globalThis.__E2E_MAIL;
const authRecords = globalThis.__E2E_AUTH_RECORDS;
const authByEmail = globalThis.__E2E_AUTH;

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function token(uid, email, verified) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64url({
    sub: uid, email, email_verified: verified, firebase: { sign_in_provider: 'password' },
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

async function endpoint(action, { method = 'POST', bearer = null, body = {} } = {}) {
  const req = { method, url: `/api/email?action=${action}`, headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, body };
  const res = fakeRes();
  await handleEmailEndpoint(req, res);
  return res;
}

function seed(uid, { verified = false } = {}) {
  const email = `${uid}@example.com`;
  authByEmail.set(email, uid);
  authRecords.set(uid, { uid, email, emailVerified: verified, metadata: { creationTime: new Date().toUTCString() } });
  return email;
}

const verify = (uid) => endpoint('verify', { bearer: token(uid, `${uid}@example.com`, authRecords.get(uid)?.emailVerified === true) });
const reset = (email) => endpoint('reset', { body: { email } });
const sentTo = (email) => mail.filter((m) => m.body.to[0].email === email);

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

out('verification and reset emails');

await check('verify: branded email with our link and no raw URL in the HTML', async () => {
  const email = seed('newbie');
  const res = await verify('newbie');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { sent: true });
  const [m] = sentTo(email);
  assert.ok(m, 'an email was sent');
  assert.equal(m.body.sender.email, 'hello@roleberry.app');
  assert.equal(m.body.replyTo.email, 'support@roleberry.app');
  assert.equal(m.body.subject, 'Verify your email for Roleberry');
  assert.deepEqual(m.body.tags, ['auth-verify']);
  const link = `https://roleberry.test/auth/action?mode=verifyEmail&amp;oobCode=verify-newbie%40example.com`;
  assert.ok(m.body.htmlContent.includes(`href="${link}"`), 'button links to our page');
  assert.ok(m.body.htmlContent.includes('Verify my email'));
  const visible = m.body.htmlContent.replace(/<[^>]+>/g, ' ');
  assert.ok(!/https?:\/\//.test(visible), 'no URL shown as text in the HTML');
  assert.ok(!m.body.htmlContent.includes('firebaseapp.com') && !m.body.htmlContent.includes('apiKey'));
  assert.ok(!/unsubscribe/i.test(m.body.htmlContent), 'security email has no unsubscribe footer');
  assert.ok(m.body.textContent.includes('Verify my email: https://roleberry.test/auth/action?mode=verifyEmail&oobCode='));
  assert.ok(fs.get('emailState/newbie').verifySentAt);
});

await check('verify: a second request within a minute is refused with 429', async () => {
  const before = mail.length;
  const res = await verify('newbie');
  assert.equal(res.statusCode, 429);
  assert.equal(mail.length, before);
});

await check('verify: works again after the cooldown', async () => {
  fs.set('emailState/newbie', { verifySentAt: new Date(Date.now() - 61 * 1000).toISOString() });
  const res = await verify('newbie');
  assert.equal(res.statusCode, 200);
  assert.equal(sentTo('newbie@example.com').length, 2);
});

await check('verify: already verified sends nothing', async () => {
  seed('done', { verified: true });
  const res = await verify('done');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.code, 'already_verified');
  assert.equal(sentTo('done@example.com').length, 0);
});

await check('verify: needs a signed-in caller', async () => {
  const res = await endpoint('verify');
  assert.equal(res.statusCode, 401);
});

await check('verify and reset: GET is refused', async () => {
  assert.equal((await endpoint('verify', { method: 'GET' })).statusCode, 405);
  assert.equal((await endpoint('reset', { method: 'GET' })).statusCode, 405);
});

await check('reset: branded email with our link', async () => {
  const email = seed('forgetful', { verified: true });
  const res = await reset('Forgetful@Example.com ');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  const [m] = sentTo(email);
  assert.ok(m, 'an email was sent');
  assert.equal(m.body.subject, 'Reset your Roleberry password');
  assert.deepEqual(m.body.tags, ['auth-reset']);
  assert.ok(m.body.htmlContent.includes('href="https://roleberry.test/auth/action?mode=resetPassword&amp;oobCode=reset-forgetful%40example.com"'));
  assert.ok(m.body.htmlContent.includes('Reset password'));
  assert.ok(!m.body.htmlContent.replace(/<[^>]+>/g, ' ').match(/https?:\/\//));
});

await check('reset: unknown address answers the same and sends nothing', async () => {
  const before = mail.length;
  const res = await reset('nobody@example.com');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(mail.length, before);
});

await check('reset: repeat within a minute answers the same and sends nothing', async () => {
  const before = mail.length;
  const res = await reset('forgetful@example.com');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(mail.length, before);
});

await check('reset: a malformed address is a 400', async () => {
  assert.equal((await reset('not-an-email')).statusCode, 400);
});

await check('Brevo failure answers 503 so the app falls back to Firebase', async () => {
  seed('unlucky');
  globalThis.__E2E_MAIL_FAIL = true;
  try {
    const res = await verify('unlucky');
    assert.equal(res.statusCode, 503);
    assert.equal(fs.get('emailState/unlucky')?.verifySentAt, undefined, 'a failed send does not start the cooldown');
  } finally {
    globalThis.__E2E_MAIL_FAIL = false;
  }
});

await check('no Brevo key answers 503 before looking anything up', async () => {
  delete process.env.BREVO_API_KEY;
  try {
    assert.equal((await reset('forgetful@example.com')).statusCode, 503);
    assert.equal((await verify('unlucky')).statusCode, 503);
  } finally {
    process.env.BREVO_API_KEY = 'test';
  }
});

await check('preview-auth: needs the cron secret, then sends both to support', async () => {
  assert.equal((await endpoint('preview-auth', { method: 'GET' })).statusCode, 401);
  const before = mail.length;
  const res = await endpoint('preview-auth', { method: 'GET', bearer: 'cron-test' });
  assert.deepEqual(res.body, { sent: 2 });
  const sent = mail.slice(before);
  assert.deepEqual(sent.map((m) => m.body.subject), ['[Preview] Verify your email for Roleberry', '[Preview] Reset your Roleberry password']);
  assert.ok(sent.every((m) => m.body.to[0].email === 'support@roleberry.app'));
});

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
