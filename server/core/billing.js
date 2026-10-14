import Stripe from 'stripe';
import { requireAuth } from './firebaseAuth.js';
import {
  getUserDoc,
  updateUserDoc,
  findUidByStripeCustomer,
  getEntitlement,
} from './firestore.js';

// Stripe billing: one product, one monthly price, Checkout in subscription mode, the Customer
// Portal for cancel / card changes, and a webhook that is the ONLY thing allowed to move a user
// between free and paid. The checkout success redirect deliberately grants nothing: a redirect
// is a URL anyone can type, a signed webhook is not.
//
// Env:
//   STRIPE_SECRET_KEY       sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET   whsec_... for the endpoint pointing at /api/stripe-webhook
//   STRIPE_PRICE_ID         price_... of the $12/month recurring price
//   APP_URL                 optional, e.g. https://roleberry.app. Where Stripe sends people back.

function sanitizeEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
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
 * POST /api/billing/checkout -> { url }
 * Starts a Stripe Checkout session for the $12/month plan. The browser follows `url`.
 */
export async function handleCreateCheckout(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const stripe = getStripe();
  if (!stripe) return notConfigured(res, 'STRIPE_SECRET_KEY');
  const price = sanitizeEnv(process.env.STRIPE_PRICE_ID);
  if (!price) return notConfigured(res, 'STRIPE_PRICE_ID');

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) return notConfigured(res, 'FIREBASE_SERVICE_ACCOUNT');

    // Paying twice for the same thing is the one billing bug customers never forgive.
    const entitlement = getEntitlement(user, stored);
    if (entitlement.plan !== 'free') {
      return res.status(409).json({ error: 'You already have full access.', plan: entitlement.plan });
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
      metadata: { firebaseUid: user.uid },
      allow_promotion_codes: true,
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancelled`,
    });

    console.log('[billing] checkout session %s for uid=%s', session.id, user.uid);
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
 * POST /api/billing/status -> { plan, used, limit, window, subscriptionStatus, renewsAt, cancelAtPeriodEnd }
 * What the UI needs to decide between an Upgrade button and a Manage button. The client could
 * read most of this from its own user document, but comped accounts live in env vars the
 * browser cannot see, and the limits live here.
 */
export async function handleBillingStatus(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const stored = await getUserDoc(user.uid);
    const entitlement = getEntitlement(user, stored || {});
    return res.json({
      ...entitlement,
      billingAvailable: Boolean(getStripe() && sanitizeEnv(process.env.STRIPE_PRICE_ID)),
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

  // 'unlimited' is the comped grant and outranks anything Stripe says.
  if (stored.plan !== 'unlimited') {
    const plan = paid ? 'paid' : 'free';
    update.plan = plan;
    if (stored.plan !== plan) update.planSince = new Date().toISOString();
  }

  await updateUserDoc(uid, update);
  console.log('[billing] uid=%s subscription=%s status=%s plan=%s', uid, sub.id, sub.status, update.plan || stored.plan);
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
