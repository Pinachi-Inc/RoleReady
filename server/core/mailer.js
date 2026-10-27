import axios from 'axios';

// Transactional email through Brevo's HTTP API rather than SMTP: serverless functions cannot
// keep an SMTP connection open, and one HTTPS call fits inside a short function timeout.
// Feedback goes to our own support inbox; lifecycle emails go to the account holder.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_ADDRESS = 'support@roleberry.app';
const LIFECYCLE_ADDRESS = 'hello@roleberry.app';

let warnedUnconfigured = false;

/**
 * Send one email to the support inbox. Never throws: a report that could not be emailed is
 * still stored, so the caller only needs to know whether it went.
 *
 * @param {{ subject: string, text: string, html: string, replyTo?: string|null,
 *           attachment?: { name: string, content: string }|null }} message
 *   attachment.content is plain base64, without the data: prefix.
 * @returns {Promise<{ sent: true } | { sent: false, reason: string }>}
 */
export async function sendSupportEmail({ subject, text, html, replyTo = null, attachment = null }) {
  const body = {
    sender: { name: 'Roleberry Feedback', email: process.env.FEEDBACK_FROM_EMAIL || DEFAULT_ADDRESS },
    to: [{ email: process.env.FEEDBACK_TO_EMAIL || DEFAULT_ADDRESS }],
    subject,
    textContent: text,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = { email: replyTo };
  if (attachment) body.attachment = [attachment];
  return postBrevo(body);
}

/**
 * One email to a user. Never throws.
 * @param {{ to: string, subject: string, text: string, html: string, headers?: object, tags?: string[] }} m
 * @returns {Promise<{ sent: true } | { sent: false, reason: string }>}
 */
export async function sendUserEmail({ to, subject, text, html, headers = {}, tags = [] }) {
  const body = {
    sender: { name: 'Roleberry', email: process.env.LIFECYCLE_FROM_EMAIL || LIFECYCLE_ADDRESS },
    to: [{ email: to }],
    replyTo: { email: DEFAULT_ADDRESS },
    subject,
    textContent: text,
    htmlContent: html,
  };
  // Brevo rejects an empty headers object or tags list ("headers is blank"), so send them only
  // when there is something in them.
  if (headers && Object.keys(headers).length) body.headers = headers;
  if (tags?.length) body.tags = tags;
  return postBrevo(body);
}

async function postBrevo(body) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn('[mailer] BREVO_API_KEY is not set; nothing is emailed');
    }
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await axios.post(BREVO_URL, body, {
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      timeout: 8000,
    });
    return { sent: true };
  } catch (err) {
    const status = err?.response?.status;
    const reason = status ? `brevo_${status}` : 'network';
    // Brevo's own words ("Key not found", "unrecognised IP address") tell a wrong key from a
    // blocked IP; the status alone does not.
    console.error('[mailer] send failed: %s %s', reason, brevoDetail(err));
    return { sent: false, reason };
  }
}

// Brevo's error code and message, or the network error, short and with anything key-shaped masked.
function brevoDetail(err) {
  const data = err?.response?.data;
  const detail = data && typeof data === 'object'
    ? [data.code, data.message].filter(Boolean).join(': ')
    : String(data || err?.code || err?.message || '');
  return detail.replace(/x(keysib|smtpsib)-[\w-]+/gi, 'x$1-***').slice(0, 200);
}
