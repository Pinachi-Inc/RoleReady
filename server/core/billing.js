import Stripe from 'stripe';
import { requireAuth } from './firebaseAuth.js';
import {
  getUserDoc,
  updateUserDoc,
  findUidByStripeCustomer,
  getEntitlement,
  compMirrorUpdate,
} from './firestore.js';

// Stripe billing: two monthly prices (Pro and Max), Checkout in subscription mode for a free
// account's first subscription, the Customer Portal for everything after (switching between Pro
// and Max, cancel, card changes), and a webhook that is the ONLY thing allowed to change a
// user's plan. The checkout success redirect deliberately grants nothing: a redirect is a URL
// anyone can type, a signed webhook is not.
//
// Env:
//   STRIPE_SECRET_KEY       sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET   whsec_... for the endpoint pointing at /api/stripe-webhook
//   STRIPE_PRICE_ID         price_... of the $12/month Pro price
//   STRIPE_PRICE_ID_MAX     price_... of the $49/month Max price
//   APP_URL                 optional, e.g. https://roleberry.app. Where Stripe sends people back.

function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

// Checkout's `plan` param -> the env var holding its price, and the plan stored on the user.
const CHECKOUT_PLANS = {
  pro: { priceEnv: 'STRIPE_PRICE_ID', plan: 'paid' },
  max: { priceEnv: 'STRIPE_PRICE_ID_MAX', plan: 'max' },
};

const priceFor = (key) => sanitizeEnv(process.env[CHECKOUT_PLANS[key].priceEnv]);

/**
 * The plan a live subscription pays for, from its price. A price that matches neither env var
 * (an old or hand-made one) is treated as Pro and logged, rather than locking out someone who
 * is paying.
 */
export function planForSubscription(sub) {
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  for (const key of Object.keys(CHECKOUT_PLANS)) {
    if (priceId && priceId === priceFor(key)) return CHECKOUT_PLANS[key].plan;
  }
  console.warn('[billing] subscription %s has unknown price %s; treating it as Pro', sub.id, priceId);
  return 'paid';
}

let cachedStripe = null;

export function getStripe() {
  const key = sanitizeEnv(process.env.STRIPE_SECRET_KEY);
  if (!key) return null;
  if (!cachedStripe) cachedStripe = new Stripe(key);
  return cachedStripe;
}

// Statuses that keep paid access. past_due is Stripe's retry window after a failed renewal:
// cutting someone off the moment one card charge bounces is harsher than Stripe's own dunning,
// which moves the subscription to unpaid or canceled when it gives up.
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isPaidStatus(status) {
  return PAID_STATUSES.has(status);
}

// Where Stripe returns the browser. APP_URL wins when set; otherwise the request's own origin,
// which is right on Vercel, Firebase Hosting and the Vite dev proxy alike.
function appUrl(req) {
  const configured = sanitizeEnv(process.env.APP_URL);
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

// One Stripe customer per Firebase user, created on first checkout and remembered on the user
// document. The uid also goes on the customer's metadata so the webhook can find its way back
// even if the Firestore write here were lost.
async function ensureCustomer(stripe, user, stored) {
  if (stored?.stripeCustomerId) return stored.stripeCustomerId;

  const customer = await stripe.customers.create(
    {
      email: user.email || undefined,
      metadata: { firebaseUid: user.uid },
    },
    // A double click must not create two customers for one account.
    { idempotencyKey: `customer-${user.uid}` }
  );
  await updateUserDoc(user.uid, { stripeCustomerId: customer.id });
  console.log('[billing] created customer %s for uid=%s', customer.id, user.uid);
  return customer.id;
}

/**
 * POST /api/billing/checkout { plan: 'pro' | 'max' } -> { url }
 * Starts a Stripe Checkout session for a free account. The browser follows `url`. Accounts that
 * already subscribe get 409 use_portal: switching plans happens in the Customer Portal, which
 * changes the existing subscription instead of starting a second one.
 */
export async function handleCreateCheckout(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const key = req.body?.plan;
  if (typeof key !== 'string' || !Object.hasOwn(CHECKOUT_PLANS, key)) {
    return res.status(400).json({ error: 'Choose a plan: pro or max.' });
  }

  const stripe = getStripe();
  if (!stripe) return notConfigured(res, 'STRIPE_SECRET_KEY');
  const price = priceFor(key);
  if (!price) return notConfigured(res, CHECKOUT_PLANS[key].priceEnv);

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');

    // Paying twice for the same thing is the one billing bug customers never forgive.
    const entitlement = getEntitlement(user, stored);
    if (entitlement.plan !== 'free') {
      return entitlement.comped
        ? res.status(409).json({ error: 'You already have full access.', plan: entitlement.plan })
        : res.status(409).json({ error: 'You already subscribe. Change plans from Manage subscription.', code: 'use_portal', plan: entitlement.plan });
    }

    const customer = await ensureCustomer(stripe, user, stored);
    const base = appUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.uid,
      line_items: [{ price, quantity: 1 }],
      // On the subscription itself, so every later subscription event carries the uid.
      subscription_data: { metadata: { firebaseUid: user.uid } },
      metadata: { firebaseUid: user.uid, plan: key },
      allow_promotion_codes: true,
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancelled`,
    });

    console.log('[billing] checkout session %s (%s) for uid=%s', session.id, key, user.uid);
    return res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}

/**
 * POST /api/billing/portal -> { url }
 * Opens the Stripe Customer Portal, where people cancel, change card and see invoices.
 */
export async function handleCustomerPortal(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const stripe = getStripe();
  if (!stripe) return notConfigured(res, 'STRIPE_SECRET_KEY');

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');
    if (!stored?.stripeCustomerId) {
      return res.status(404).json({ error: 'There is no subscription on this account.' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: stored.stripeCustomerId,
      return_url: `${appUrl(req)}/`,
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not open billing settings. Please try again.' });
  }
}

/**
 * POST /api/billing/status -> { plan, used, limit, window, fairUse, billingAvailable, maxAvailable,
 *                               subscriptionStatus, renewsAt, cancelAtPeriodEnd }
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
      billingAvailable: Boolean(getStripe() && priceFor('pro')),
      maxAvailable: Boolean(getStripe() && priceFor('max')),
      hasCustomer: Boolean(stored?.stripeCustomerId),
      subscriptionStatus: stored?.subscriptionStatus || null,
      renewsAt: stored?.planRenewsAt || null,
      cancelAtPeriodEnd: Boolean(stored?.cancelAtPeriodEnd),
    });
  } catch (err) {
    console.error('[billing] status failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not load your plan.' });
  }
}

// Signature verification needs the exact bytes Stripe sent. Express hands them over through
// express.raw, Firebase Functions through req.rawBody, and on Vercel the body is only parsed
// when req.body is touched, so the stream is still unread here.
// The descriptor is inspected rather than req.body read, because on Vercel req.body is a lazy
// getter and reading it is exactly what consumes the stream.
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

// API 2025-03-31 moved the billing period from the subscription onto its items.
function periodEnd(sub) {
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function uidForSubscription(stripe, sub) {
  if (sub.metadata?.firebaseUid) return sub.metadata.firebaseUid;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const fromDb = customerId ? await findUidByStripeCustomer(customerId) : null;
  if (fromDb) return fromDb;
  if (customerId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer && !customer.deleted && customer.metadata?.firebaseUid) return customer.metadata.firebaseUid;
  }
  return null;
}

/**
 * Write a subscription's CURRENT state onto its user. Events can arrive late, twice, or out of
 * order, so the event payload is only used to find the subscription; its state is re-read from
 * Stripe. Replaying any event, in any order, converges on the truth.
 */
async function syncSubscription(stripe, subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const uid = await uidForSubscription(stripe, sub);
  if (!uid) {
    console.error('[billing] subscription %s has no linked user; ignoring', sub.id);
    return;
  }

  const stored = (await getUserDoc(uid)) || {};
  const paid = isPaidStatus(sub.status);

  // A late event about an old, dead subscription must not downgrade someone who has since
  // subscribed again.
  if (!paid && stored.stripeSubscriptionId && stored.stripeSubscriptionId !== sub.id) {
    console.log('[billing] ignoring %s (%s): uid=%s is on %s', sub.id, sub.status, uid, stored.stripeSubscriptionId);
    return;
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const update = {
    stripeCustomerId: customerId || stored.stripeCustomerId || null,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    planRenewsAt: periodEnd(sub),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };

  // `plan` only ever records what Stripe says: the price on the live subscription decides
  // between Pro and Max, which is how a switch made in the Customer Portal
  // (customer.subscription.updated) lands. A comp lives in separate fields, so writing the
  // Stripe plan here can never take Max away from a comped account. An account still on the
  // old comp marker, plan: 'unlimited', is converted to the flag on the way.
  const plan = paid ? planForSubscription(sub) : 'free';
  update.plan = plan;
  if (stored.plan !== plan) update.planSince = new Date().toISOString();
  if (stored.plan === 'unlimited') update.comped = true;

  await updateUserDoc(uid, update);
  console.log('[billing] uid=%s subscription=%s status=%s plan=%s comped=%s', uid, sub.id, sub.status, plan, Boolean(stored.comped || update.comped));
}

/**
 * Re-read an account's subscription from Stripe and write its plan, for when something other
 * than a webhook needs `plan` to be current (revoking a comp). Returns the plan now stored.
 */
export async function resyncPlanFromStripe(uid) {
  const stored = (await getUserDoc(uid)) || {};
  const stripe = getStripe();
  if (stored.stripeSubscriptionId && stripe) {
    await syncSubscription(stripe, stored.stripeSubscriptionId);
    return ((await getUserDoc(uid)) || {}).plan || 'free';
  }
  return stored.plan === 'paid' || stored.plan === 'max' ? stored.plan : 'free';
}

/**
 * POST /api/stripe-webhook
 * Events: checkout.session.completed, customer.subscription.created|updated|deleted,
 * invoice.paid, invoice.payment_failed.
 */
export async function handleStripeWebhook(req, res) {
  const stripe = getStripe();
  const secret = sanitizeEnv(process.env.STRIPE_WEBHOOK_SECRET);
  if (!stripe) return notConfigured(res, 'STRIPE_SECRET_KEY');
  if (!secret) return notConfigured(res, 'STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (err) {
    console.warn('[billing] webhook rejected: %s', err?.message || err);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  try {
    const obj = event.data.object;
    let subscriptionId = null;

    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode === 'subscription') subscriptionId = obj.subscription;
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        subscriptionId = obj.id;
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        subscriptionId = obj.subscription || obj.parent?.subscription_details?.subscription || null;
        break;
      default:
        break;
    }

    if (subscriptionId) {
      await syncSubscription(stripe, typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id);
    } else {
      console.log('[billing] webhook %s (%s) needs no action', event.type, event.id);
    }
    return res.json({ received: true });
  } catch (err) {
    // A 500 makes Stripe retry with backoff, which is what we want for a transient Firestore
    // or Stripe failure.
    console.error('[billing] webhook %s (%s) failed: %s', event.type, event.id, err?.message || err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}
