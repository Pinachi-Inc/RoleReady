// End-to-end checks for /api/feedback, run against the real handler with an in-memory
// Firestore, locally signed Firebase tokens and a stubbed Brevo API (see loader.mjs and
// fake-axios.mjs).
//
//   node --import ./scripts/e2e/register.mjs scripts/e2e/feedback.test.mjs

import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const PROJECT = 'roleberry-e2e';
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: PROJECT });
process.env.BREVO_API_KEY = 'test';
delete process.env.FEEDBACK_TO_EMAIL;
delete process.env.FEEDBACK_FROM_EMAIL;
delete process.env.BILLING_ENFORCED;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
globalThis.__E2E_CERTS = { k1: publicKey.export({ type: 'spki', format: 'pem' }) };

const { handleFeedback } = await import('../../server/core/feedbackHandler.js');
const fs = globalThis.__E2E_FS;
const mail = globalThis.__E2E_MAIL;

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

// uid: signs the request as that user; omit for a signed-out visitor. bearer overrides the
// Authorization value outright (for a garbage token). headers adds more, e.g. x-forwarded-for.
let ipCounter = 0;
const freshIp = () => `192.0.2.${(ipCounter += 1)}`;

async function send(body, { uid = null, bearer = null, headers = {} } = {}) {
  const auth = bearer ? { authorization: `Bearer ${bearer}` } : uid ? { authorization: `Bearer ${token(uid, `${uid}@example.com`)}` } : {};
  const req = { headers: { 'x-forwarded-for': freshIp(), ...auth, ...headers }, body, socket: {} };
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
const handler = handleFeedback;

const report = (extra = {}) => ({
  type: 'bug',
  message: '  The download button does nothing.  ',
  email: null,
  screenshot: null,
  page: { url: 'https://roleberry.app/', path: '/', referrer: '' },
  client: { userAgent: 'e2e', language: 'en-US', languages: ['en-US', 'en'], timezone: 'UTC', viewport: '1280x800', screen: '1440x900@2', theme: 'light' },
  recentErrors: ['2026-10-15T12:00:00.000Z PDF import: boom'],
  website: '',
  ...extra,
});

const feedbackKeys = () => new Set([...fs.keys()].filter((k) => /^feedback\/[^/]+$/.test(k)));
// Sends a report and returns the response plus the one feedback document it created, if any.
async function sendAndFind(body, opts) {
  const before = feedbackKeys();
  const mailBefore = mail.length;
  const res = await send(body, opts);
  const created = [...feedbackKeys()].filter((k) => !before.has(k));
  assert.ok(created.length <= 1, 'at most one report stored per request');
  return { res, path: created[0], doc: created[0] ? fs.get(created[0]) : null, mails: mail.slice(mailBefore) };
}

const SHOT = `data:image/jpeg;base64,${Buffer.from('fake jpeg bytes').toString('base64')}`;

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

out('feedback and problem reports');

await check('signed-in bug report with a screenshot is stored and emailed', async () => {
  const { res, path, doc, mails } = await sendAndFind(report({ screenshot: SHOT }), { uid: 'fb_user1' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);
  assert.match(res.body.ref, /^RB-[A-Z0-9]{6}$/);
  assert.ok(doc, 'report stored');
  assert.equal(doc.ref, res.body.ref);
  assert.equal(doc.uid, 'fb_user1');
  assert.equal(doc.type, 'bug');
  assert.equal(doc.message, 'The download button does nothing.');
  assert.equal(doc.email, 'fb_user1@example.com');
  assert.equal(doc.emailSource, 'account');
  assert.equal(doc.plan, 'free');
  assert.equal(doc.status, 'new');
  assert.equal(doc.hasScreenshot, true);
  assert.equal(doc.emailed, true);
  assert.equal(doc.ipHash, null, 'no IP hash on signed-in reports');
  assert.ok(fs.has(`${path}/attachments/screenshot`), 'screenshot stored');
  assert.equal(fs.get(`${path}/attachments/screenshot`).dataUrl, SHOT);

  assert.equal(mails.length, 1);
  const { body, headers } = mails[0];
  assert.deepEqual(body.to, [{ email: 'support@roleberry.app' }]);
  assert.equal(headers['api-key'], 'test');
  assert.equal(body.replyTo.email, 'fb_user1@example.com');
  assert.ok(body.subject.startsWith('[Bug]'), body.subject);
  assert.ok(body.subject.includes(res.body.ref), body.subject);
  assert.equal(body.attachment.length, 1);
  assert.equal(body.attachment[0].content, SHOT.split(',')[1]);
});

await check('signed-out report with a form email replies to that email', async () => {
  const { res, doc, mails } = await sendAndFind(report({ type: 'feedback', email: ' Visitor@Example.com ' }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.uid, null);
  assert.equal(doc.signedIn, false);
  assert.equal(doc.emailSource, 'form');
  assert.equal(doc.email, 'visitor@example.com');
  assert.match(doc.ipHash, /^[0-9a-f]{32}$/);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].body.replyTo.email, 'visitor@example.com');
  assert.ok(mails[0].body.subject.startsWith('[Feedback]'));
});

await check('signed-out report without an email has no reply-to', async () => {
  const { res, doc, mails } = await sendAndFind(report({ type: 'other' }));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.email, null);
  assert.equal(doc.emailSource, null);
  assert.equal(mails.length, 1);
  assert.equal('replyTo' in mails[0].body, false);
  assert.match(mails[0].body.textContent, /from an anonymous visitor/);
});

await check('a garbage token is treated as signed out, not 401', async () => {
  const { res, doc } = await sendAndFind(report(), { bearer: 'not.a.token' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(doc.uid, null);
  assert.equal(doc.signedIn, false);
});

await check('invalid reports are refused with 400', async () => {
  const cases = [
    [{ type: 'x' }, 'Please choose what kind of message this is.'],
    [{ message: '  a ' }, 'Please write a few words about what happened.'],
    [{ message: 'x'.repeat(5001) }, 'That message is too long. Please keep it under 5,000 characters.'],
    [{ email: 'nope' }, "That email address doesn't look right."],
    [{ screenshot: 'data:text/html;base64,AAAA' }, "That screenshot couldn't be attached. Please try a smaller image."],
  ];
  for (const [extra, error] of cases) {
    const { res, doc } = await sendAndFind(report(extra));
    assert.equal(res.statusCode, 400, JSON.stringify(extra));
    assert.equal(res.body.error, error);
    assert.equal(doc, null, 'nothing stored');
  }
});

await check('honeypot: answered as success, nothing stored or sent', async () => {
  const { res, doc, mails } = await sendAndFind(report({ website: 'http://spam' }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, ref: null });
  assert.equal(doc, null);
  assert.equal(mails.length, 0);
});

await check('rate limits: 3 per IP signed out, 5 per account signed in', async () => {
  const ip = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };
  for (let i = 0; i < 3; i += 1) assert.equal((await send(report(), { headers: ip })).statusCode, 200, `report ${i + 1}`);
  const fourth = await send(report(), { headers: ip });
  assert.equal(fourth.statusCode, 429);
  assert.equal(fourth.body.code, 'rate_limited');
  assert.equal((await send(report(), { headers: { 'x-forwarded-for': '198.51.100.9' } })).statusCode, 200, 'other IP');

  for (let i = 0; i < 5; i += 1) assert.equal((await send(report(), { uid: 'fb_limited' })).statusCode, 200, `signed-in ${i + 1}`);
  const sixth = await send(report(), { uid: 'fb_limited' });
  assert.equal(sixth.statusCode, 429);
  assert.equal(sixth.body.code, 'rate_limited');
});

await check('the raw IP is stored nowhere', async () => {
  for (const [path, value] of fs) {
    assert.ok(!JSON.stringify(value).includes('203.0.113.7'), `raw IP found in ${path}`);
  }
});

await check('a Brevo failure still stores the report', async () => {
  globalThis.__E2E_MAIL_FAIL = true;
  try {
    const { res, doc } = await sendAndFind(report(), { uid: 'fb_mailfail' });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(doc.emailed, false);
    assert.equal(doc.emailError, 'brevo_500');
  } finally {
    globalThis.__E2E_MAIL_FAIL = false;
  }
});

await check('without BREVO_API_KEY reports are stored but not emailed', async () => {
  delete process.env.BREVO_API_KEY;
  try {
    const { res, doc, mails } = await sendAndFind(report(), { uid: 'fb_nomail' });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(doc.emailed, false);
    assert.equal(doc.emailError, 'not_configured');
    assert.equal(mails.length, 0);
  } finally {
    process.env.BREVO_API_KEY = 'test';
  }
});

await check('user text is HTML-escaped in the email', async () => {
  const { res, mails } = await sendAndFind(report({ message: '<script>alert(1)</script>' }), { uid: 'fb_xss' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const html = mails[0].body.htmlContent;
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), html);
  assert.ok(!html.includes('<script>'), 'raw script tag in the HTML');
});

out(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
