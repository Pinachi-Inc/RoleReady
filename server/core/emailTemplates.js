import { PLAN_LIMITS } from './firestore.js';

// The four account emails (see server/core/lifecycleEmails.js). Each template is a subject and a
// list of blocks, rendered to plain text and to deliberately plain HTML so it reads like a
// personal email: no images, no logo, no tracking pixels.
//   { p: 'text' }               paragraph
//   { ol: ['a', 'b'] }          numbered list
//   { cta: 'Label', url }       link

const APP = (process.env.APP_URL || 'https://roleberry.app').replace(/\/+$/, '');

const FREE_RUNS = PLAN_LIMITS.free.optimizations;
const PRO_RUNS = PLAN_LIMITS.paid.optimizations.toLocaleString('en-US');
const PRO_PROFILES = PLAN_LIMITS.paid.profiles;
const PRO_PRICE = '$12'; // keep in step with components/PricingModal.jsx

const SIGN_OFF = 'The Roleberry team';

export function welcomeEmail() {
  return {
    subject: 'Welcome to Roleberry',
    tag: 'lifecycle-welcome',
    blocks: [
      { p: 'Hi,' },
      { p: "Thanks for signing up for Roleberry. Here's the quickest way to see what it does:" },
      {
        ol: [
          'Add your info once. You can upload your current CV as a PDF to fill it in.',
          'Paste a job post you want to apply for.',
          'Get a CV tailored to that job, plus a cover letter if you want one, ready to download.',
        ],
      },
      { p: `Your free plan includes ${FREE_RUNS} runs.` },
      { cta: 'Make your first CV', url: `${APP}/` },
      { p: 'If anything is confusing or broken, just reply to this email. A real person reads every reply.' },
      { p: SIGN_OFF },
    ],
  };
}

export function nudgeEmail() {
  return {
    subject: 'Your first tailored CV takes a minute',
    tag: 'lifecycle-nudge',
    blocks: [
      { p: 'Hi,' },
      { p: "You signed up for Roleberry a couple of days ago but haven't made a CV yet." },
      {
        p: `Pick one job you'd like to apply for and paste the posting into Roleberry. In under a minute you'll have a CV matched to it. Your ${FREE_RUNS} free runs are still there.`,
      },
      { cta: 'Try it now', url: `${APP}/` },
      { p: "If something stopped you, reply and tell us what it was. We read every reply." },
      { p: SIGN_OFF },
    ],
  };
}

export function outOfRunsEmail() {
  return {
    subject: `You've used your ${FREE_RUNS} free runs`,
    tag: 'lifecycle-out-of-runs',
    blocks: [
      { p: 'Hi,' },
      { p: `You've used all ${FREE_RUNS} free runs on Roleberry. Your recent CVs are still saved in History.` },
      {
        p: `If you're still applying, Pro gives you ${PRO_RUNS} runs a month, ${PRO_PROFILES} profiles and your full history for ${PRO_PRICE} a month. You can cancel anytime, and you get a full refund if you ask within 7 days of your first payment.`,
      },
      { cta: 'See Pro', url: `${APP}/?upgrade=pro` },
      { p: 'Questions? Just reply to this email.' },
      { p: SIGN_OFF },
    ],
  };
}

// endsAt: the subscription's ends_at (ISO string), or missing.
export function cancelledEmail({ planLabel, endsAt }) {
  const when = Date.parse(endsAt);
  const until = Number.isFinite(when)
    ? new Date(when).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    : null;
  const access = until
    ? `You keep full access until ${until} and won't be charged again.`
    : "You keep full access until the end of the period you've paid for and won't be charged again.";
  return {
    subject: 'Can I ask why you cancelled?',
    tag: 'lifecycle-cancelled',
    blocks: [
      { p: 'Hi,' },
      {
        p: `Your Roleberry ${planLabel} subscription is cancelled. ${access} If you change your mind before then, you can resume it from Manage subscription in the account menu.`,
      },
      {
        p: 'Could you tell us why you cancelled? Just hit reply. One line is plenty: found a job, missing a feature, too expensive, something broke. Every answer helps us make Roleberry better.',
      },
      { p: 'Thanks for giving it a try.' },
      { p: SIGN_OFF },
    ],
  };
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ subject: string, blocks: object[] }} template
 * @param {{ unsubscribeUrl: string }} options
 * @returns {{ subject: string, text: string, html: string }}
 */
export function renderEmail({ subject, blocks }, { unsubscribeUrl }) {
  const text = [
    ...blocks.map((b) => {
      if (b.ol) return b.ol.map((item, i) => `${i + 1}. ${item}`).join('\n');
      if (b.cta) return `${b.cta}: ${b.url}`;
      return b.p;
    }),
    `You're getting this because you have a Roleberry account. Don't want these emails? Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n\n');

  const body = blocks.map((b) => {
    if (b.ol) return `<ol style="margin:0 0 14px;padding-left:22px">${b.ol.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
    if (b.cta) return `<p style="margin:0 0 14px"><a href="${escapeHtml(b.url)}" style="color:#B8174F;font-weight:bold">${escapeHtml(b.cta)}</a></p>`;
    return `<p style="margin:0 0 14px">${escapeHtml(b.p)}</p>`;
  }).join('\n');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#24131C;max-width:560px">
${body}
<hr style="border:0;border-top:1px solid #eee;margin:24px 0 12px">
<p style="margin:0;font-size:12px;color:#6b5a63">You're getting this because you have a Roleberry account. Don't want these emails? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b5a63">Unsubscribe</a></p>
</div>`;

  return { subject, text, html };
}
