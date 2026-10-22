import crypto from 'node:crypto';
import { sendUserEmail } from './mailer.js';
import {
  getEmailState,
  setEmailState,
  claimEmail,
  releaseEmail,
  getAuthUser,
  getUserDoc,
  listAuthUsersPage,
  billingPlanOf,
  isCompedAccount,
} from './firestore.js';
import { welcomeEmail, nudgeEmail, outOfRunsEmail, cancelledEmail, renderEmail, escapeHtml } from './emailTemplates.js';

// Four account emails, each sent at most once per account, only to a verified address, and never
// after the person unsubscribes: welcome, a reminder to someone who has not made a CV, a note
// when the free runs are used up, and a question when a subscription is cancelled. State lives
// in the server-only emailState/{uid} collection. Email must never break a status call, a run or
// a webhook, so every exported trigger swallows its own errors.
//
// Env: BREVO_API_KEY, EMAIL_LINK_SECRET (signs unsubscribe links), CRON_SECRET (guards the cron
// and preview), LIFECYCLE_EMAILS_ENABLED (true forces on, false forces off; on by default in
// Vercel Production only), APP_URL.

const APP = (process.env.APP_URL || 'https://roleberry.app').replace(/\/+$/, '');
const DAY_MS = 24 * 60 * 60 * 1000;

let warnedDisabled = false;

export function lifecycleEnabled() {
  const flag = String(process.env.LIFECYCLE_EMAILS_ENABLED || '').trim().toLowerCase();
  const on = flag === 'true' || (process.env.VERCEL_ENV === 'production' && flag !== 'false');
  const ready = Boolean(process.env.BREVO_API_KEY) && Boolean(process.env.EMAIL_LINK_SECRET);
  const enabled = on && ready;
  if (!enabled && !warnedDisabled) {
    warnedDisabled = true;
    console.log('[lifecycle] disabled: %s', !on ? 'not switched on for this environment' : 'BREVO_API_KEY or EMAIL_LINK_SECRET is missing');
  }
  return enabled;
}

export function unsubscribeToken(uid) {
  return crypto
    .createHmac('sha256', String(process.env.EMAIL_LINK_SECRET || ''))
    .update(`unsubscribe:${uid}`)
    .digest('base64url')
    .slice(0, 32);
}

export function validUnsubscribeToken(uid, token) {
  if (!uid || !token || !process.env.EMAIL_LINK_SECRET) return false;
  const expected = Buffer.from(unsubscribeToken(uid));
  const given = Buffer.from(String(token));
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function unsubscribeUrl(uid) {
  return `${APP}/api/email?action=unsubscribe&u=${encodeURIComponent(uid)}&t=${unsubscribeToken(uid)}`;
}

function build(uid, template) {
  const url = unsubscribeUrl(uid);
  return {
    ...renderEmail(template, { unsubscribeUrl: url }),
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

// Reserve the send, deliver it, and give the reservation back if delivery failed.
async function send(uid, to, template, field, value) {
  if (!(await claimEmail(uid, field, value))) return false;
  const { subject, text, html, headers } = build(uid, template);
  const result = await sendUserEmail({ to, subject, text, html, headers, tags: [template.tag] });
  if (result.sent) {
    await setEmailState(uid, { email: to });
    console.log('[lifecycle] sent %s uid=%s', template.tag, uid);
    return true;
  }
  await releaseEmail(uid, field);
  console.error('[lifecycle] %s failed uid=%s: %s', template.tag, uid, result.reason);
  return false;
}

export async function maybeSendWelcome(user) {
  try {
    if (!lifecycleEnabled() || !user?.email) return;
    const state = await getEmailState(user.uid);
    if (!state || state.welcomeSentAt || state.welcomeSkipped || state.unsubscribedAt) return;
    const record = await getAuthUser(user.uid);
    const created = Date.parse(record?.metadata?.creationTime);
    if (!record || !Number.isFinite(created)) return;
    if (Date.now() - created > 3 * DAY_MS) {
      await setEmailState(user.uid, { welcomeSkipped: 'old_account' });
      return;
    }
    await send(user.uid, user.email, welcomeEmail(), 'welcomeSentAt', new Date().toISOString());
  } catch (err) {
    console.error('[lifecycle] welcome failed uid=%s: %s', user?.uid, err?.message || err);
  }
}

export async function maybeSendOutOfRuns(user) {
  try {
    if (!lifecycleEnabled() || !user?.email) return;
    await send(user.uid, user.email, outOfRunsEmail(), 'outOfRunsSentAt', new Date().toISOString());
  } catch (err) {
    console.error('[lifecycle] out-of-runs failed uid=%s: %s', user?.uid, err?.message || err);
  }
}

// billing.js passes planLabel so this module never imports billing.js (which imports this one).
export async function maybeSendCancelled(uid, sub, planLabel) {
  try {
    if (!lifecycleEnabled()) return;
    const record = await getAuthUser(uid);
    if (!record?.email || !record.emailVerified) return;
    await send(uid, record.email, cancelledEmail({ planLabel, endsAt: sub.attributes?.ends_at }), 'cancelSentFor', String(sub.id));
  } catch (err) {
    console.error('[lifecycle] cancel failed uid=%s: %s', uid, err?.message || err);
  }
}

// Daily: accounts 48 hours to 7 days old that got the welcome and have never made a CV.
export async function runNudgeSweep(now = Date.now()) {
  if (!lifecycleEnabled()) return { checked: 0, sent: 0, disabled: true };
  let checked = 0;
  let sent = 0;
  let pageToken;
  do {
    const page = await listAuthUsersPage(pageToken);
    for (const record of page.users) {
      try {
        if (!record.email || !record.emailVerified || record.disabled) continue;
        const age = now - Date.parse(record.metadata?.creationTime);
        if (!Number.isFinite(age) || age < 2 * DAY_MS || age > 7 * DAY_MS) continue;
        checked += 1;
        const state = await getEmailState(record.uid);
        if (!state?.welcomeSentAt || state.nudgeSentAt || state.unsubscribedAt) continue;
        const doc = (await getUserDoc(record.uid)) || {};
        if (Number(doc.lifetimeUsage?.optimizations || 0) !== 0) continue;
        if (billingPlanOf(doc) !== 'free' || isCompedAccount({ uid: record.uid, email: record.email }, doc)) continue;
        if (await send(record.uid, record.email, nudgeEmail(), 'nudgeSentAt', new Date(now).toISOString())) sent += 1;
      } catch (err) {
        console.error('[lifecycle] nudge failed uid=%s: %s', record.uid, err?.message || err);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { checked, sent };
}

// All four templates to the support inbox, for reviewing copy and deliverability. Writes no state.
export async function sendPreviews() {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_LINK_SECRET) return { sent: 0, reason: 'not_configured' };
  const to = process.env.FEEDBACK_TO_EMAIL || 'support@roleberry.app';
  const templates = [
    welcomeEmail(),
    nudgeEmail(),
    outOfRunsEmail(),
    cancelledEmail({ planLabel: 'Pro', endsAt: new Date(Date.now() + 30 * DAY_MS).toISOString() }),
  ];
  let sent = 0;
  for (const template of templates) {
    const { text, html, headers } = build('preview', template);
    const result = await sendUserEmail({ to, subject: `[Preview] ${template.subject}`, text, html, headers, tags: [template.tag] });
    if (result.sent) sent += 1;
  }
  return { sent };
}

function page(res, status, title, bodyHtml) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#24131C}.card{background:#fff;border-radius:12px;box-shadow:0 1px 8px rgba(0,0,0,.08);padding:32px;max-width:420px;margin:16px;text-align:center}h1{font-size:20px;margin:0 0 12px}p{margin:0 0 16px;line-height:1.5}button{background:#B8174F;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer}</style></head><body><div class="card">${bodyHtml}</div></body></html>`;
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
}

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers?.authorization === `Bearer ${secret}`;
}

// One function for unsubscribe, the daily cron and the preview, to stay inside Vercel Hobby's
// function limit. Dispatches on ?action=.
export async function handleEmailEndpoint(req, res) {
  const params = new URL(req.url || '/', 'http://local').searchParams;
  const action = params.get('action');

  if (action === 'unsubscribe') {
    const uid = params.get('u');
    const token = params.get('t');
    if (!validUnsubscribeToken(uid, token)) {
      return page(res, 400, 'Unsubscribe', "<h1>Link not valid</h1><p>This unsubscribe link isn't valid. Email support@roleberry.app and we'll take you off the list.</p>");
    }
    if (req.method === 'POST') {
      await setEmailState(uid, { unsubscribedAt: new Date().toISOString() });
      return page(res, 200, 'Unsubscribed', "<h1>You're unsubscribed</h1><p>You won't get these emails again.</p>");
    }
    // A GET never unsubscribes: link scanners open GET links.
    const target = `/api/email?action=unsubscribe&u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
    return page(res, 200, 'Unsubscribe', `<h1>Unsubscribe from Roleberry emails?</h1><p>You'll still get sign-in and payment emails.</p><form method="post" action="${escapeHtml(target)}"><button type="submit">Unsubscribe</button></form>`);
  }

  if (action === 'nudge' || action === 'preview') {
    if (!cronAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(action === 'nudge' ? await runNudgeSweep() : await sendPreviews());
  }

  return res.status(404).json({ error: 'Not found' });
}
