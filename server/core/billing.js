import crypto from 'node:crypto';
import axios from 'axios';
import { requireAuth } from './firebaseAuth.js';
import {
  getUserDoc,
  updateUserDoc,
  findUidByBillingField,
  getEntitlement,
  compMirrorUpdate,
} from './firestore.js';

// Billing through Lemon Squeezy, which is the merchant of record: it sells the subscription to
// the customer, takes the payment, handles sales tax / VAT and the receipt, and pays us out.
//
// Two monthly variants, Pro and Max. A free account starts a Lemon Squeezy checkout. An existing
// subscriber switches between Pro and Max here (an API variant change, prorated by Lemon
// Squeezy) and does everything else (cancel, card, invoices) in Lemon Squeezy's customer portal.
// The signed webhook is the ONLY thing allowed to change a user's plan. The checkout redirect
// grants nothing: a redirect is a URL anyone can type, a signed webhook is not.
//
// Env:
//   LEMONSQUEEZY_API_KEY            API key (Settings > API). A test-mode key gives test mode.
//   LEMONSQUEEZY_STORE_ID           numeric store id
//   LEMONSQUEEZY_VARIANT_ID_PRO     variant id of the $12/month Pro plan
//   LEMONSQUEEZY_VARIANT_ID_MAX     variant id of the $49/month Max plan
//   LEMONSQUEEZY_WEBHOOK_SECRET     signing secret of the webhook pointing at /api/lemonsqueezy-webhook
//   APP_URL                         optional, e.g. https://roleberry.app. Where checkout returns to.

const API = 'https://api.lemonsqueezy.com/v1';

function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

const env = (name) => sanitizeEnv(process.env[name]);

// Checkout's `plan` param -> the env var holding its variant, and the plan stored on the user.
const CHECKOUT_PLANS = {
  pro: { variantEnv: 'LEMONSQUEEZY_VARIANT_ID_PRO', plan: 'paid' },
  max: { variantEnv: 'LEMONSQUEEZY_VARIANT_ID_MAX', plan: 'max' },
};

const variantFor = (key) => env(CHECKOUT_PLANS[key].variantEnv);
const keyForPlan = (plan) => (plan === 'max' ? 'max' : plan === 'paid' ? 'pro' : null);

export const billingConfigured = () => Boolean(env('LEMONSQUEEZY_API_KEY') && env('LEMONSQUEEZY_STORE_ID'));

function lsHeaders() {
  return {
    Accept: 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${env('LEMONSQUEEZY_API_KEY')}`,
  };
}

async function getSubscription(id) {
  const { data } = await axios.get(`${API}/subscriptions/${encodeURIComponent(id)}`, { headers: lsHeaders() });
  return data.data;
}

/**
 * The plan a subscription pays for, from its variant. A variant that matches neither env var
 * (an old or hand-made one) is treated as Pro and logged, rather than locking out someone who
 * is paying.
 */
export function planForSubscription(sub) {
  const variant = String(sub.attributes?.variant_id ?? '');
  for (const key of Object.keys(CHECKOUT_PLANS)) {
    if (variant && variant === variantFor(key)) return CHECKOUT_PLANS[key].plan;
  }
  console.warn('[billing] subscription %s has unknown variant %s; treating it as Pro', sub.id, variant);
  return 'paid';
}

/**
 * Whether a subscription still grants its plan.
 *   active, on_trial  yes
 *   past_due          yes: Lemon Squeezy's retry window after a failed renewal. Cutting someone
 *                     off on the first bounced charge is harsher than its own dunning, which
 *                     moves the subscription to unpaid or expired when it gives up.
 *   cancelled         yes until ends_at: cancelled means "will not renew", and the customer has
 *                     paid up to then. Lemon Squeezy sends subscription_expired at that point.
 *   paused, unpaid, expired   no
 */
export function hasAccess(sub, now = Date.now()) {
  const { status, ends_at: endsAt } = sub.attributes || {};
  if (status === 'active' || status === 'on_trial' || status === 'past_due') return true;
  if (status === 'cancelled') return Boolean(endsAt) && Date.parse(endsAt) > now;
  return false;
}

// Where checkout returns the browser. APP_URL wins when set; otherwise the request's own origin,
// which is right on Vercel, Firebase Hosting and the Vite dev proxy alike.
function appUrl(req) {
  const configured = env('APP_URL');
  if (configured) return configured.replace(/\/+$/, '');
  const origin = req.headers?.origin;
  if (origin) return String(origin).replace(/\/+$/, '');
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  const proto = req.headers?.['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function notConfigured(res, what) {
  console.error('[billing] %s is not set; billing is unavailable', what);
  res.status(503).json({ error: 'Billing is not available right now.' });
}

/**
 * POST /api/billing/checkout { plan: 'pro' | 'max' }
 *   free account          -> { url } of a Lemon Squeezy checkout. The browser follows it.
 *   subscriber, same plan -> 409 use_portal
 *   subscriber, other plan-> { switched: plan }: the subscription's variant is changed in place,
 *                            prorated by Lemon Squeezy, so nobody ends up with two subscriptions.
 *   comped                -> 409, nothing to buy
 */
export async function handleCreateCheckout(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const key = req.body?.plan;
  if (typeof key !== 'string' || !Object.hasOwn(CHECKOUT_PLANS, key)) {
    return res.status(400).json({ error: 'Choose a plan: pro or max.' });
  }

  if (!env('LEMONSQUEEZY_API_KEY')) return notConfigured(res, 'LEMONSQUEEZY_API_KEY');
  if (!env('LEMONSQUEEZY_STORE_ID')) return notConfigured(res, 'LEMONSQUEEZY_STORE_ID');
  const variant = variantFor(key);
  if (!variant) return notConfigured(res, CHECKOUT_PLANS[key].variantEnv);

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');

    const entitlement = getEntitlement(user, stored);
    if (entitlement.comped) {
      return res.status(409).json({ error: 'You already have full access.', plan: entitlement.plan });
    }
    if (entitlement.plan !== 'free') {
      // Paying twice for the same thing is the one billing bug customers never forgive.
      if (keyForPlan(entitlement.plan) === key || !stored.billingSubscriptionId) {
        return res.status(409).json({ error: 'You already subscribe. Change plans from Manage subscription.', code: 'use_portal', plan: entitlement.plan });
      }
      return await switchPlan(user, stored, key, variant, res);
    }

    const { data } = await axios.post(`${API}/checkouts`, {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: user.email || undefined,
            // Comes back on every webhook for this subscription as meta.custom_data.
            custom: { user_id: user.uid, plan: key },
          },
          product_options: {
            redirect_url: `${appUrl(req)}/?checkout=success`,
            enabled_variants: [Number(variant)],
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: env('LEMONSQUEEZY_STORE_ID') } },
          variant: { data: { type: 'variants', id: variant } },
        },
      },
    }, { headers: lsHeaders() });

    console.log('[billing] checkout %s (%s) for uid=%s', data.data?.id, key, user.uid);
    return res.json({ url: data.data.attributes.url });
  } catch (err) {
    console.error('[billing] checkout failed for uid=%s: %s', user.uid, err?.response?.status || err?.message || err);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}

// Pro <-> Max for an existing subscriber: change the subscription's variant. Lemon Squeezy
// prorates by default. The plan is written from the subscription it returns, the same way the
// webhook would, and the webhook that follows converges on the same answer.
async function switchPlan(user, stored, key, variant, res) {
  const id = stored.billingSubscriptionId;
  const { data } = await axios.patch(`${API}/subscriptions/${encodeURIComponent(id)}`, {
    data: { type: 'subscriptions', id: String(id), attributes: { variant_id: Number(variant) } },
  }, { headers: lsHeaders() });
  await writeSubscription(user.uid, data.data, stored);
  console.log('[billing] uid=%s switched subscription %s to %s', user.uid, id, key);
  return res.json({ switched: key });
}

/**
 * POST /api/billing/portal -> { url }
 * Lemon Squeezy's customer portal, where people cancel, change card and see invoices. The link
 * is signed and short-lived, so it is fetched fresh from the subscription every time.
 */
export async function handleCustomerPortal(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!env('LEMONSQUEEZY_API_KEY')) return notConfigured(res, 'LEMONSQUEEZY_API_KEY');

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');
    if (!stored?.billingSubscriptionId) {
      return res.status(404).json({ error: 'There is no subscription on this account.' });
    }
    const sub = await getSubscription(stored.billingSubscriptionId);
    const urls = sub.attributes?.urls || {};
    const url = urls.customer_portal || urls.update_payment_method;
    if (!url) return res.status(404).json({ error: 'Billing settings are not available for this subscription.' });
    return res.json({ url });
  } catch (err) {
    console.error('[billing] portal failed for uid=%s: %s', user.uid, err?.response?.status || err?.message || err);
    return res.status(500).json({ error: 'Could not open billing settings. Please try again.' });
  }
}

/**
 * POST /api/billing/status -> { plan, comped, billingPlan, used, limit, window, fairUse,
 *   extraTemplates, billingAvailable, maxAvailable, hasCustomer, subscriptionStatus, renewsAt, cancelAtPeriodEnd }
 * What the UI needs to decide between an Upgrade button and a Manage button. The client could
 * read most of this from its own user document, but comped accounts live in env vars the
 * browser cannot see, and the limits live here.
 */
export async function handleBillingStatus(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const stored = await getUserDoc(user.uid);
    // The app loads status on sign-in, so an allowlisted account's profile cap in
    // firestore.rules is right before its first profile write, not after its first run.
    const mirror = stored !== undefined ? compMirrorUpdate(user, stored) : null;
    if (mirror) await updateUserDoc(user.uid, mirror);
    const entitlement = getEntitlement(user, stored || {});
    return res.json({
      ...entitlement,
      billingAvailable: Boolean(billingConfigured() && variantFor('pro')),
      maxAvailable: Boolean(billingConfigured() && variantFor('max')),
      hasCustomer: Boolean(stored?.billingSubscriptionId),
      subscriptionStatus: stored?.subscriptionStatus || null,
      renewsAt: stored?.planRenewsAt || null,
      cancelAtPeriodEnd: Boolean(stored?.cancelAtPeriodEnd),
    });
  } catch (err) {
    console.error('[billing] status failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not load your plan.' });
  }
}

// The signature is over the exact bytes Lemon Squeezy sent. Express hands them over through
// express.raw, Firebase Functions through req.rawBody, and on Vercel the body is only parsed
// when req.body is touched, so the stream is still unread here. The descriptor is inspected
// rather than req.body read, because on Vercel req.body is a lazy getter and reading it is
// exactly what consumes the stream.
async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;

  const own = Object.getOwnPropertyDescriptor(req, 'body');
  if (own && 'value' in own) {
    if (Buffer.isBuffer(own.value)) return own.value;
    if (typeof own.value === 'string') return Buffer.from(own.value, 'utf8');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  if (chunks.length) return Buffer.concat(chunks);

  // Stream already drained by something upstream; take a raw copy if one was kept.
  const body = req.body;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  throw new Error('raw request body is unavailable, so the signature cannot be checked');
}

// X-Signature is the hex HMAC-SHA256 of the raw body under the webhook's signing secret.
export function validSignature(raw, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest();
  let given;
  try {
    given = Buffer.from(String(signature), 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * Write a subscription's state onto its user. `plan` only ever records what Lemon Squeezy
 * says: the variant decides between Pro and Max, which is how a switch lands. A comp lives in
 * separate fields, so this can never take Max away from a comped account. An account still on
 * the old comp marker, plan: 'unlimited', is converted to the flag on the way.
 */
async function writeSubscription(uid, sub, stored = null) {
  const current = stored || (await getUserDoc(uid)) || {};
  const a = sub.attributes || {};
  const access = hasAccess(sub);

  // A late event about an old, dead subscription must not downgrade someone who has since
  // subscribed again.
  if (!access && current.billingSubscriptionId && String(current.billingSubscriptionId) !== String(sub.id)) {
    console.log('[billing] ignoring %s (%s): uid=%s is on %s', sub.id, a.status, uid, current.billingSubscriptionId);
    return;
  }

  const plan = access ? planForSubscription(sub) : 'free';
  const update = {
    billingCustomerId: a.customer_id != null ? String(a.customer_id) : current.billingCustomerId || null,
    billingSubscriptionId: String(sub.id),
    subscriptionStatus: a.status || null,
    planRenewsAt: (a.status === 'cancelled' ? a.ends_at : a.renews_at) || null,
    cancelAtPeriodEnd: a.status === 'cancelled' || Boolean(a.cancelled),
    plan,
  };
  if (current.plan !== plan) update.planSince = new Date().toISOString();
  if (current.plan === 'unlimited') update.comped = true;

  await updateUserDoc(uid, update);
  console.log('[billing] uid=%s subscription=%s status=%s plan=%s comped=%s', uid, sub.id, a.status, plan, Boolean(current.comped || update.comped));
}

// The account a subscription belongs to: the uid passed at checkout (signed, so trusted), else
// whoever the server already linked to that subscription or customer.
async function uidFor(event, sub) {
  const fromCheckout = event.meta?.custom_data?.user_id;
  if (typeof fromCheckout === 'string' && fromCheckout) return fromCheckout;
  return (await findUidByBillingField('billingSubscriptionId', sub.id))
    || (await findUidByBillingField('billingCustomerId', sub.attributes?.customer_id));
}

const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_plan_changed',
]);
const INVOICE_EVENTS = new Set([
  'subscription_payment_success',
  'subscription_payment_failed',
  'subscription_payment_recovered',
  'subscription_payment_refunded',
]);

/**
 * POST /api/lemonsqueezy-webhook
 * Events are only used to find the subscription; its current state is re-read from the API.
 * Events can arrive late, twice, or out of order, and replaying any of them, in any order,
 * converges on the truth.
 */
export async function handleBillingWebhook(req, res) {
  const secret = env('LEMONSQUEEZY_WEBHOOK_SECRET');
  if (!secret) return notConfigured(res, 'LEMONSQUEEZY_WEBHOOK_SECRET');
  if (!env('LEMONSQUEEZY_API_KEY')) return notConfigured(res, 'LEMONSQUEEZY_API_KEY');

  let event;
  try {
    const raw = await readRawBody(req);
    if (!validSignature(raw, req.headers['x-signature'], secret)) throw new Error('signature mismatch');
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.warn('[billing] webhook rejected: %s', err?.message || err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const name = event.meta?.event_name;
  try {
    let subscriptionId = null;
    if (SUBSCRIPTION_EVENTS.has(name)) subscriptionId = event.data?.id;
    else if (INVOICE_EVENTS.has(name)) subscriptionId = event.data?.attributes?.subscription_id;

    if (!subscriptionId) {
      console.log('[billing] webhook %s needs no action', name);
      return res.json({ received: true });
    }

    const sub = await getSubscription(subscriptionId);
    const uid = await uidFor(event, sub);
    if (!uid) {
      console.error('[billing] subscription %s has no linked user; ignoring', sub.id);
      return res.json({ received: true });
    }
    await writeSubscription(uid, sub);
    return res.json({ received: true });
  } catch (err) {
    // A 500 makes Lemon Squeezy retry, which is what we want for a transient Firestore or API
    // failure.
    console.error('[billing] webhook %s failed: %s', name, err?.response?.status || err?.message || err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Re-read an account's subscription from Lemon Squeezy and write its plan, for when something
 * other than a webhook needs `plan` to be current (revoking a comp). Returns the plan now stored.
 */
export async function resyncPlanFromBilling(uid) {
  const stored = (await getUserDoc(uid)) || {};
  if (stored.billingSubscriptionId && env('LEMONSQUEEZY_API_KEY')) {
    await writeSubscription(uid, await getSubscription(stored.billingSubscriptionId));
    return ((await getUserDoc(uid)) || {}).plan || 'free';
  }
  return stored.plan === 'paid' || stored.plan === 'max' ? stored.plan : 'free';
}
