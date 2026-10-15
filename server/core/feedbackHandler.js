import crypto from 'node:crypto';
import { optionalAuth } from './firebaseAuth.js';
import {
  isFirestoreReady, getUserDoc, getEntitlement, saveFeedback, markFeedbackEmailed, takeFeedbackQuota,
} from './firestore.js';
import { sendSupportEmail } from './mailer.js';

// Feedback and problem reports from the in-app Feedback button. Open to signed-out visitors as
// well, because someone who cannot sign in is exactly who most needs to reach us.
//
// Each report is stored in Firestore first and then emailed, and the reporter gets a reference
// as long as either worked. The browser never touches the collection (firestore.rules), so
// everything that matters (validation, rate limits, the account details) happens here.

const TYPES = ['bug', 'feedback', 'other'];
const TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback', other: 'Other' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCREENSHOT_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_MESSAGE = 5000;
const MAX_SCREENSHOT_CHARS = 1_000_000;
const PAGE_KEYS = ['path', 'referrer'];
const CLIENT_KEYS = ['userAgent', 'language', 'languages', 'timezone', 'viewport', 'screen', 'theme'];

const TEN_MINUTES = 10 * 60 * 1000;

const short = (v) => (v == null ? null : String(v).slice(0, 500));

function projectId() {
  const raw = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '';
  return String(raw).trim().replace(/^['"]|['"]$/g, '');
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  return first || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// Salted so the stored value cannot be turned back into an address by hashing every IPv4.
function hashIp(ip) {
  const salt = process.env.FEEDBACK_IP_SALT || projectId() || 'roleberry';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Returns { error } or { value } with everything trimmed, capped and stripped of unknown keys.
function validate(body) {
  const { type, message, email, screenshot } = body;

  if (!TYPES.includes(type)) return { error: 'Please choose what kind of message this is.' };

  const text = typeof message === 'string' ? message.trim() : '';
  if (text.length < 3) return { error: 'Please write a few words about what happened.' };
  if (text.length > MAX_MESSAGE) return { error: 'That message is too long. Please keep it under 5,000 characters.' };

  let formEmail = null;
  if (email != null && email !== '') {
    const cleaned = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleaned || cleaned.length > 254 || !EMAIL_RE.test(cleaned)) {
      return { error: "That email address doesn't look right." };
    }
    formEmail = cleaned;
  }

  let shot = null;
  if (screenshot != null && screenshot !== '') {
    const match = typeof screenshot === 'string' && screenshot.length <= MAX_SCREENSHOT_CHARS
      ? SCREENSHOT_RE.exec(screenshot)
      : null;
    if (!match) return { error: "That screenshot couldn't be attached. Please try a smaller image." };
    shot = { dataUrl: screenshot, contentType: `image/${match[1]}`, chars: screenshot.length };
  }

  const rawPage = body.page && typeof body.page === 'object' ? body.page : {};
  const url = typeof rawPage.url === 'string' && /^https?:\/\//.test(rawPage.url) && rawPage.url.length <= 2000
    ? rawPage.url
    : null;
  const page = { url };
  for (const key of PAGE_KEYS) page[key] = short(rawPage[key]);

  const rawClient = body.client && typeof body.client === 'object' ? body.client : {};
  const client = {};
  for (const key of CLIENT_KEYS) client[key] = short(rawClient[key]);

  const recentErrors = Array.isArray(body.recentErrors)
    ? body.recentErrors.filter((e) => typeof e === 'string').slice(0, 10).map((e) => e.slice(0, 300))
    : [];

  return { value: { type, message: text, formEmail, screenshot: shot, page, client, recentErrors } };
}

// Signed-in reports are limited per account only, so a shared office IP never blocks a
// customer. Signed-out ones are limited per hashed IP and, all together, per day, which caps
// what a botnet rotating addresses can do to the inbox.
function limitKeys(user, ipHash) {
  if (user) return [{ key: `uid_${user.uid}`, windowMs: TEN_MINUTES, windowLimit: 5, dayLimit: 20 }];
  return [
    { key: `ip_${ipHash}`, windowMs: TEN_MINUTES, windowLimit: 3, dayLimit: 10 },
    { key: 'anon_global', windowMs: null, windowLimit: null, dayLimit: 300 },
  ];
}

function buildEmail(record) {
  const label = TYPE_LABEL[record.type];
  const oneLine = record.message.replace(/\s*[\r\n]+\s*/g, ' ');
  const preview = oneLine.length > 60 ? `${oneLine.slice(0, 60)}…` : oneLine;
  const subject = `[${label}] ${preview} (${record.ref})`;

  const from = record.email || 'an anonymous visitor';
  const account = `${record.uid || 'signed out'} · plan ${record.plan || '-'}${record.comped ? ' (comped)' : ''}`
    + ` · email verified ${record.emailVerified ? 'yes' : 'no'} · via ${record.provider || '-'}`;
  const { page, client } = record;
  const screen = `viewport ${client.viewport || '-'}, screen ${client.screen || '-'}, ${client.theme || '-'} mode, `
    + `${client.language || '-'}, ${client.timezone || '-'}`;
  const details = [
    ['Account', account],
    ['Page', page.url || '-'],
    ['Browser', client.userAgent || '-'],
    ['Screen', screen],
    ['App version', record.appVersion || '-'],
  ];
  const errors = record.recentErrors.length ? record.recentErrors : ['none'];
  const shot = record.hasScreenshot ? 'attached' : 'none';

  const text = [
    `${label} from ${from}  ·  ${record.ref}`,
    '',
    record.message,
    '',
    ...details.map(([k, v]) => `${k}: ${v}`),
    'Recent errors:',
    ...errors.map((e) => `  ${e}`),
    `Screenshot: ${shot}`,
  ].join('\n');

  // Every value below came from the reporter's browser, so all of it is escaped.
  const html = [
    `<p><strong>${escapeHtml(label)}</strong> from ${escapeHtml(from)} &nbsp;·&nbsp; ${escapeHtml(record.ref)}</p>`,
    `<p style="white-space:pre-wrap">${escapeHtml(record.message)}</p>`,
    '<p>',
    ...details.map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(v)}<br>`),
    '</p>',
    '<p>Recent errors:</p>',
    `<ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`,
    `<p>Screenshot: ${shot}</p>`,
  ].join('\n');

  return { subject, text, html };
}

/**
 * POST /api/feedback
 *   { type, message, email?, screenshot?, page, client, recentErrors, website }
 *   -> { ok: true, ref }   400 { error } invalid, 429 rate_limited, 503 nothing worked
 */
export async function handleFeedback(req, res) {
  const user = await optionalAuth(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Bots fill every field; people never see this one. Answer as if it worked so they move on.
  if (typeof body.website === 'string' && body.website.trim()) {
    return res.json({ ok: true, ref: null });
  }

  const checked = validate(body);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const input = checked.value;

  const ipHash = hashIp(clientIp(req));
  const firestoreReady = isFirestoreReady();

  if (firestoreReady) {
    const limit = await takeFeedbackQuota(limitKeys(user, ipHash));
    if (limit && !limit.allowed) {
      return res.status(429).json({ error: 'Too many reports', code: 'rate_limited' });
    }
  }

  let plan = null;
  let comped = false;
  if (user) {
    try {
      const stored = await getUserDoc(user.uid);
      if (stored && typeof stored === 'object') ({ plan, comped } = getEntitlement(user, stored));
    } catch (err) {
      console.error('[feedback] could not read the account: %s', err?.message || err);
    }
  }

  const email = user?.email || input.formEmail || null;
  const record = {
    type: input.type,
    message: input.message,
    status: 'new',
    email,
    emailSource: user?.email ? 'account' : input.formEmail ? 'form' : null,
    uid: user?.uid || null,
    signedIn: Boolean(user),
    emailVerified: Boolean(user?.emailVerified),
    provider: user?.provider || null,
    plan,
    comped: Boolean(comped),
    page: input.page,
    client: input.client,
    recentErrors: input.recentErrors,
    hasScreenshot: Boolean(input.screenshot),
    appVersion: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
    ipHash: user ? null : ipHash,
    emailed: false,
    emailError: null,
  };

  let saved = null;
  if (firestoreReady) {
    try {
      saved = await saveFeedback(record, input.screenshot);
    } catch (err) {
      console.error('[feedback] could not store report: %s', err?.message || err);
    }
  }
  record.ref = saved?.ref || `RB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  const { subject, text, html } = buildEmail(record);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[input.screenshot?.contentType] || 'jpg';
  const mail = await sendSupportEmail({
    subject,
    text,
    html,
    replyTo: email,
    attachment: input.screenshot
      ? { name: `screenshot-${record.ref}.${ext}`, content: input.screenshot.dataUrl.split(',')[1] }
      : null,
  });

  if (saved) {
    await markFeedbackEmailed(saved.id, mail.sent ? { emailed: true } : { emailed: false, emailError: mail.reason });
  }

  console.log('[feedback] stored ref=%s type=%s uid=%s emailed=%s', record.ref, record.type, record.uid || '-', mail.sent);

  if (!saved && !mail.sent) {
    return res.status(503).json({ error: 'Feedback is not available right now.' });
  }
  return res.json({ ok: true, ref: record.ref });
}
