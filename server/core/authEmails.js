import { sendUserEmail } from './mailer.js';
import { optionalAuth } from './firebaseAuth.js';
import { getAuthUser, getAuthUserByEmail, getEmailState, setEmailState, generateAuthActionLink } from './firestore.js';
import { verifyEmailTemplate, resetPasswordTemplate, renderEmail } from './emailTemplates.js';

// Our own email-verification and password-reset emails, in place of Firebase's default ones.
// Firebase Auth still owns the one-time code: the Admin SDK makes a link, we keep only its
// oobCode and point it at our own page (/auth/action, components/AuthActionPage.jsx), so the
// email shows a branded button and the click lands on roleberry.app, not on Firebase's page.
//
// These are security emails, so they ignore the lifecycle switch and unsubscribes. When Brevo is
// not set up, or a send fails, the endpoint answers 503 and the app falls back to Firebase's own
// email, so a sign-up never ends up without a link.

const APP = (process.env.APP_URL || 'https://roleberry.app').replace(/\/+$/, '');
const COOLDOWN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Our link for a Firebase action link: same oobCode, our page. Null when the link has no code.
export function actionUrl(mode, firebaseLink) {
  let code = null;
  try {
    code = new URL(firebaseLink).searchParams.get('oobCode');
  } catch {
    code = null;
  }
  if (!code) return null;
  return `${APP}/auth/action?mode=${mode}&oobCode=${encodeURIComponent(code)}`;
}

async function sendAction(mode, email) {
  const link = await generateAuthActionLink(mode, email);
  const url = actionUrl(mode, link);
  if (!url) return { sent: false, reason: 'no_code' };
  const template = mode === 'resetPassword' ? resetPasswordTemplate(url) : verifyEmailTemplate(url);
  const { subject, text, html } = renderEmail(template);
  return sendUserEmail({ to: email, subject, text, html, tags: [template.tag] });
}

// Seconds until this account may be sent this kind of email again (0 when it may now).
async function cooldownLeft(uid, field) {
  try {
    const state = await getEmailState(uid);
    const last = Date.parse(state?.[field]);
    if (!Number.isFinite(last)) return 0;
    return Math.max(0, Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000));
  } catch (err) {
    console.error('[auth-email] cooldown check failed uid=%s: %s', uid, err?.message || err);
    return 0;
  }
}

// POST /api/email?action=verify, signed in (unverified password accounts too).
export async function handleSendVerification(req, res) {
  const caller = await optionalAuth(req);
  if (!caller) return res.status(401).json({ error: 'Authentication required' });
  if (!process.env.BREVO_API_KEY) return res.status(503).json({ code: 'not_configured' });

  try {
    const record = await getAuthUser(caller.uid);
    if (!record?.email) return res.status(400).json({ code: 'no_email' });
    if (record.emailVerified) return res.json({ sent: false, code: 'already_verified' });
    const wait = await cooldownLeft(caller.uid, 'verifySentAt');
    if (wait > 0) return res.status(429).json({ code: 'too_many_requests', retryAfter: wait });

    const result = await sendAction('verifyEmail', record.email);
    if (!result.sent) {
      console.error('[auth-email] verify failed uid=%s: %s', caller.uid, result.reason);
      return res.status(503).json({ code: 'send_failed' });
    }
    await setEmailState(caller.uid, { verifySentAt: new Date().toISOString() });
    console.log('[auth-email] sent auth-verify uid=%s', caller.uid);
    return res.json({ sent: true });
  } catch (err) {
    console.error('[auth-email] verify failed uid=%s: %s', caller.uid, err?.code || err?.message || err);
    return res.status(503).json({ code: 'send_failed' });
  }
}

// POST /api/email?action=reset with { email }. Answers the same whether or not the account
// exists, so it does not reveal who has signed up.
export async function handleSendPasswordReset(req, res) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ code: 'invalid_email' });
  if (!process.env.BREVO_API_KEY) return res.status(503).json({ code: 'not_configured' });

  try {
    const record = await getAuthUserByEmail(email);
    if (!record || record.disabled) return res.json({ ok: true });
    if ((await cooldownLeft(record.uid, 'resetSentAt')) > 0) return res.json({ ok: true });

    const result = await sendAction('resetPassword', record.email || email);
    if (!result.sent) {
      console.error('[auth-email] reset failed uid=%s: %s', record.uid, result.reason);
      return res.status(503).json({ code: 'send_failed' });
    }
    await setEmailState(record.uid, { resetSentAt: new Date().toISOString() });
    console.log('[auth-email] sent auth-reset uid=%s', record.uid);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth-email] reset failed: %s', err?.code || err?.message || err);
    return res.status(503).json({ code: 'send_failed' });
  }
}

// Both emails to the support inbox with sample links, for reviewing how they look.
export async function sendAuthPreviews() {
  if (!process.env.BREVO_API_KEY) return { sent: 0, reason: 'not_configured' };
  const to = process.env.FEEDBACK_TO_EMAIL || 'support@roleberry.app';
  const templates = [
    verifyEmailTemplate(`${APP}/auth/action?mode=verifyEmail&oobCode=preview`),
    resetPasswordTemplate(`${APP}/auth/action?mode=resetPassword&oobCode=preview`),
  ];
  let sent = 0;
  for (const template of templates) {
    const { text, html } = renderEmail(template);
    const result = await sendUserEmail({ to, subject: `[Preview] ${template.subject}`, text, html, tags: [template.tag] });
    if (result.sent) sent += 1;
  }
  return { sent };
}
