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
import { maybeSendWelcome, maybeSendCancelled } from './lifecycleEmails.js';

// Billing through Polar, which is the merchant of record: it sells the subscription to the
// customer, takes the payment, handles sales tax / VAT and the receipt, and pays us out.
//
// Two monthly products, Pro and Max. A free account starts a Polar checkout. An existing
// subscriber switches between Pro and Max here (an API product change, prorated by Polar) and
// does everything else (cancel, card, invoices) in Polar's customer portal.
// The signed webhook is the ONLY thing allowed to change a user's plan. The checkout redirect
// grants nothing: a redirect is a URL anyone can type, a signed webhook is not.
//
// Env:
//   POLAR_ACCESS_TOKEN       organization access token
//   POLAR_SERVER             'sandbox' or 'production' (default production)
//   POLAR_PRODUCT_ID_PRO     product id of the $12/month Pro plan
//   POLAR_PRODUCT_ID_MAX     product id of the $49/month Max plan
//   POLAR_WEBHOOK_SECRET     secret of the webhook pointing at /api/polar-webhook
//   APP_URL                  optional, e.g. https://roleberry.app. Where checkout returns to.

function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

const env = (name) => sanitizeEnv(process.env[name]);

export const polarBase = () => (env('POLAR_SERVER') === 'sandbox'
  ? 'https://sandbox-api.polar.sh/v1'
  : 'https://api.polar.sh/v1');

// Checkout's `plan` param -> the env var holding its product, and the plan stored on the user.
const CHECKOUT_PLANS = {
  pro: { productEnv: 'POLAR_PRODUCT_ID_PRO', plan: 'paid' },
  max: { productEnv: 'POLAR_PRODUCT_ID_MAX', plan: 'max' },
};

const productFor = (key) => env(CHECKOUT_PLANS[key].productEnv);
const keyForPlan = (plan) => (plan === 'max' ? 'max' : plan === 'paid' ? 'pro' : null);

export const billingConfigured = () => Boolean(env('POLAR_ACCESS_TOKEN'));

function polarHeaders() {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env('POLAR_ACCESS_TOKEN')}`,
  };
}

async function getSubscription(id) {
  const { data } = await axios.get(`${polarBase()}/subscriptions/${encodeURIComponent(id)}`, { headers: polarHeaders() });
  return data;
}

/**
 * The plan a subscription pays for, from its product. A product that matches neither env var
 * (an old or hand-made one) is treated as Pro and logged, rather than locking out someone who
 * is paying.
 */
export function planForSubscription(sub) {
  const product = String(sub.product_id ?? '');
  for (const key of Object.keys(CHECKOUT_PLANS)) {
    if (product && product === productFor(key)) return CHECKOUT_PLANS[key].plan;
  }
  console.warn('[billing] subscription %s has unknown product %s; treating it as Pro', sub.id, product);
  return 'paid';
}

/**
 * Whether a subscription still grants its plan.
 *   active, trialing  yes. Polar keeps status active with cancel_at_period_end set until the
 *                     period ends, so a scheduled cancel needs no special case.
 *   past_due          yes: Polar's retry window after a failed renewal. Cutting someone off on
 *                     the first bounced charge is harsher than its own dunning, which moves the
 *                     subscription to unpaid or canceled when it gives up.
 *   canceled          yes until ends_at (else current_period_end): the customer has paid up to then.
 *   incomplete, incomplete_expired, unpaid   no
 */
export function hasAccess(sub, now = Date.now()) {
  const { status } = sub;
  if (status === 'active' || status === 'trialing' || status === 'past_due') return true;
  if (status === 'canceled') {
    const end = sub.ends_at || sub.current_period_end;
    return Boolean(end) && Date.parse(end) > now;
  }
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
 *   free account          -> { url } of a Polar checkout. The browser follows it.
 *   subscriber, same plan -> 409 use_portal
 *   subscriber, other plan-> { switched: plan }: the subscription's product is changed in place,
 *                            prorated by Polar, so nobody ends up with two subscriptions.
 *   comped                -> 409, nothing to buy
 */
export async function handleCreateCheckout(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const key = req.body?.plan;
  if (typeof key !== 'string' || !Object.hasOwn(CHECKOUT_PLANS, key)) {
    return res.status(400).json({ error: 'Choose a plan: pro or max.' });
  }

  if (!env('POLAR_ACCESS_TOKEN')) return notConfigured(res, 'POLAR_ACCESS_TOKEN');
  const product = productFor(key);
  if (!product) return notConfigured(res, CHECKOUT_PLANS[key].productEnv);

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
      return await switchPlan(user, stored, key, product, res);
    }

    const { data } = await axios.post(`${polarBase()}/checkouts/`, {
      products: [product],
      external_customer_id: user.uid,
      customer_email: user.email || undefined,
      // Comes back on the subscription as metadata.
      metadata: { user_id: user.uid, plan: key },
      success_url: `${appUrl(req)}/?checkout=success`,
    }, { headers: polarHeaders() });

    console.log('[billing] checkout %s (%s) for uid=%s', data.id, key, user.uid);
    return res.json({ url: data.url });
  } catch (err) {
    console.error('[billing] checkout failed for uid=%s: %s', user.uid, err?.response?.status || err?.message || err);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}

// Pro <-> Max for an existing subscriber: change the subscription's product. `invoice`
// prorates and charges or credits the difference immediately. The plan is written from the
// subscription Polar returns, the same way the webhook would, and the webhook that follows
// converges on the same answer.
async function switchPlan(user, stored, key, product, res) {
  const id = stored.billingSubscriptionId;
  const { data } = await axios.patch(`${polarBase()}/subscriptions/${encodeURIComponent(id)}`, {
    product_id: product,
    proration_behavior: 'invoice',
  }, { headers: polarHeaders() });
  await writeSubscription(user.uid, data, stored);
  console.log('[billing] uid=%s switched subscription %s to %s', user.uid, id, key);
  return res.json({ switched: key });
}

/**
 * POST /api/billing/portal -> { url }
 * Polar's customer portal, where people cancel, change card and see invoices. The link comes
 * from a short-lived customer session, so it is created fresh every time.
 */
export async function handleCustomerPortal(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  if (!env('POLAR_ACCESS_TOKEN')) return notConfigured(res, 'POLAR_ACCESS_TOKEN');

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');
    if (!stored?.billingSubscriptionId) {
      return res.status(404).json({ error: 'There is no subscription on this account.' });
    }
    const { data } = await axios.post(`${polarBase()}/customer-sessions/`, {
      ...(stored.billingCustomerId
        ? { customer_id: stored.billingCustomerId }
        : { external_customer_id: user.uid }),
      return_url: `${appUrl(req)}/`,
    }, { headers: polarHeaders() });
    const url = data?.customer_portal_url;
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

  // Welcome email for a new account; never throws, and finished before the response so a
  // serverless function is not frozen mid-send.
  const welcome = maybeSendWelcome(user);

  try {
    const stored = await getUserDoc(user.uid);
    // The app loads status on sign-in, so an allowlisted account's profile cap in
    // firestore.rules is right before its first profile write, not after its first run.
    const mirror = stored !== undefined ? compMirrorUpdate(user, stored) : null;
    if (mirror) await updateUserDoc(user.uid, mirror);
    const entitlement = getEntitlement(user, stored || {});
    await welcome;
    return res.json({
      ...entitlement,
      billingAvailable: Boolean(billingConfigured() && productFor('pro')),
      maxAvailable: Boolean(billingConfigured() && productFor('max')),
      hasCustomer: Boolean(stored?.billingSubscriptionId),
      subscriptionStatus: stored?.subscriptionStatus || null,
      renewsAt: stored?.planRenewsAt || null,
      cancelAtPeriodEnd: Boolean(stored?.cancelAtPeriodEnd),
    });
  } catch (err) {
    console.error('[billing] status failed for uid=%s: %s', user.uid, err?.message || err);
    await welcome;
    return res.status(500).json({ error: 'Could not load your plan.' });
  }
}

// The signature is over the exact bytes Polar sent. Express hands them over through
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

// Standard Webhooks: the signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 under the
// UTF-8 bytes of the webhook secret, base64. The signature header is a space-separated list of
// `v1,<base64>` entries and any one of them may match. A timestamp more than five minutes from
// now is rejected so a captured request cannot be replayed later.
export function validSignature({ id, timestamp, signature }, raw, secret, now = Date.now()) {
  if (!id || !timestamp || !signature || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(`${id}.${timestamp}.`)
    .update(raw)
    .digest();
  return String(signature).split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/**
 * Write a subscription's state onto its user. `plan` only ever records what Polar says: the
 * product decides between Pro and Max, which is how a switch lands. A comp lives in separate
 * fields, so this can never take Max away from a comped account. An account still on the old
 * comp marker, plan: 'unlimited', is converted to the flag on the way.
 */
async function writeSubscription(uid, sub, stored = null) {
  const current = stored || (await getUserDoc(uid)) || {};
  const access = hasAccess(sub);

  // A late event about an old, dead subscription must not downgrade someone who has since
  // subscribed again.
  if (!access && current.billingSubscriptionId && String(current.billingSubscriptionId) !== String(sub.id)) {
    console.log('[billing] ignoring %s (%s): uid=%s is on %s', sub.id, sub.status, uid, current.billingSubscriptionId);
    return;
  }

  const plan = access ? planForSubscription(sub) : 'free';
  const ending = Boolean(sub.cancel_at_period_end) || sub.status === 'canceled';
  const update = {
    billingCustomerId: sub.customer_id != null ? String(sub.customer_id) : current.billingCustomerId || null,
    billingSubscriptionId: String(sub.id),
    subscriptionStatus: sub.status || null,
    planRenewsAt: (ending ? (sub.ends_at || sub.current_period_end) : sub.current_period_end) || null,
    cancelAtPeriodEnd: ending,
    plan,
  };
  if (current.plan !== plan) update.planSince = new Date().toISOString();
  if (current.plan === 'unlimited') update.comped = true;

  await updateUserDoc(uid, update);
  console.log('[billing] uid=%s subscription=%s status=%s plan=%s comped=%s', uid, sub.id, sub.status, plan, Boolean(current.comped || update.comped));
}

// The account a subscription belongs to: the uid passed at checkout (signed, so trusted), else
// whoever the server already linked to that subscription or customer.
async function uidFor(sub) {
  const fromCheckout = sub.metadata?.user_id;
  if (typeof fromCheckout === 'string' && fromCheckout) return fromCheckout;
  const external = sub.customer?.external_id;
  if (typeof external === 'string' && external) return external;
  return (await findUidByBillingField('billingSubscriptionId', sub.id))
    || (await findUidByBillingField('billingCustomerId', sub.customer_id));
}

/**
 * POST /api/polar-webhook
 * Events are only used to find the subscription; its current state is re-read from the API.
 * Events can arrive late, twice, or out of order, and replaying any of them, in any order,
 * converges on the truth.
 */
export async function handleBillingWebhook(req, res) {
  const secret = env('POLAR_WEBHOOK_SECRET');
  if (!secret) return notConfigured(res, 'POLAR_WEBHOOK_SECRET');
  if (!env('POLAR_ACCESS_TOKEN')) return notConfigured(res, 'POLAR_ACCESS_TOKEN');

  let event;
  try {
    const raw = await readRawBody(req);
    const signed = {
      id: req.headers['webhook-id'],
      timestamp: req.headers['webhook-timestamp'],
      signature: req.headers['webhook-signature'],
    };
    if (!validSignature(signed, raw, secret)) throw new Error('signature mismatch');
    event = JSON.parse(raw.toString('utf8'));
  } catch (err) {
    console.warn('[billing] webhook rejected: %s', err?.message || err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const type = String(event.type || '');
  try {
    let subscriptionId = null;
    if (type.startsWith('subscription.')) subscriptionId = event.data?.id;
    else if (type.startsWith('order.')) subscriptionId = event.data?.subscription_id;

    if (!subscriptionId) {
      console.log('[billing] webhook %s needs no action', type);
      return res.json({ received: true });
    }

    const sub = await getSubscription(subscriptionId);
    const uid = await uidFor(sub);
    if (!uid) {
      console.error('[billing] subscription %s has no linked user; ignoring', sub.id);
      return res.json({ received: true });
    }
    await writeSubscription(uid, sub);
    if (type === 'subscription.canceled') {
      await maybeSendCancelled(uid, sub.id, planForSubscription(sub) === 'max' ? 'Max' : 'Pro', sub.ends_at || sub.current_period_end);
    }
    return res.json({ received: true });
  } catch (err) {
    // A 500 makes Polar retry, which is what we want for a transient Firestore or API failure.
    console.error('[billing] webhook %s failed: %s', type, err?.response?.status || err?.message || err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/**
 * Re-read an account's subscription from Polar and write its plan, for when something
 * other than a webhook needs `plan` to be current (revoking a comp). Returns the plan now stored.
 */
export async function resyncPlanFromBilling(uid) {
  const stored = (await getUserDoc(uid)) || {};
  if (stored.billingSubscriptionId && env('POLAR_ACCESS_TOKEN')) {
    await writeSubscription(uid, await getSubscription(stored.billingSubscriptionId));
    return ((await getUserDoc(uid)) || {}).plan || 'free';
  }
  return stored.plan === 'paid' || stored.plan === 'max' ? stored.plan : 'free';
}
