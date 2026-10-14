import admin from 'firebase-admin';

// The server could verify Firebase tokens (server/core/firebaseAuth.js, node:crypto against
// Google's public certs) but had no way to WRITE Firestore. That is fine while everything is
// free and the browser owns all persistence. It stops being fine the moment money is involved:
// a quota the client increments is a quota the client can decline to increment, and a `plan`
// field the client can write is a paid tier anyone can grant themselves from devtools.
//
// This module gives the server Admin SDK access, which bypasses firestore.rules entirely, so
// the rules can deny the client those fields outright.

let cachedApp = null;
let initAttempted = false;

function init() {
  if (initAttempted) return cachedApp;
  initAttempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('[firestore] FIREBASE_SERVICE_ACCOUNT is not set — server-side quota and history are unavailable');
    return null;
  }

  try {
    // Accept either raw JSON or base64, since some hosts mangle multi-line values.
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const creds = JSON.parse(text);
    cachedApp = admin.initializeApp({ credential: admin.credential.cert(creds) }, 'roleberry-server');
    console.log('[firestore] admin initialised for project %s', creds.project_id || '?');
    return cachedApp;
  } catch (err) {
    console.error('[firestore] could not initialise admin SDK: %s', err?.message || err);
    return null;
  }
}

export function isFirestoreReady() {
  return Boolean(init());
}

function db() {
  const app = init();
  return app ? admin.firestore(app) : null;
}

// Plan limits live here rather than in the client so the numbers cannot drift between what
// the UI promises and what the server enforces.
// null means no ceiling.
//
// `window` says what the counters count over. Free is a one-off trial, so its allowance is
// lifetime: 5 optimizations ever, not 5 a month. Paid resets each calendar month.
// Every account's runs are recorded. `historyVisible` is how many of the newest a plan can open
// and download; older ones stay stored and come back as locked stubs.
//
// Plans as stored on the user document: 'free', 'paid' (sold as Pro, $12), 'max' ($49) and
// 'unlimited' (comped). Pro keeps the stored name 'paid' so existing subscribers need no
// migration.
//
// Max is sold as unlimited runs and unlimited profiles. Both carry a hidden ceiling: runs a
// fair-use cap per calendar month (MAX_MONTHLY_RUNS), so one runaway script cannot run up a
// model bill, and profiles 100, mirrored in firestore.rules, so the user document stays well
// inside Firestore's 1 MiB limit. `fairUse` / `unlimitedProfiles` tell the UI to say
// "Unlimited" rather than show either number. Comped accounts get Max's profile treatment and
// keep their uncapped runs.
export const PLAN_LIMITS = {
  free: { window: 'lifetime', optimizations: 5, pdfImports: 10, profiles: 1, historyVisible: 5 },
  paid: { window: 'month', optimizations: 1000, pdfImports: null, profiles: 3, historyVisible: null },
  max: { window: 'month', optimizations: 5000, pdfImports: null, profiles: 100, historyVisible: null, fairUse: true, unlimitedProfiles: true },
  unlimited: { window: 'month', optimizations: null, pdfImports: null, profiles: 100, historyVisible: null, unlimitedProfiles: true },
};

export function maxMonthlyRuns() {
  const n = Number.parseInt(String(process.env.MAX_MONTHLY_RUNS || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : PLAN_LIMITS.max.optimizations;
}

export function limitsFor(plan) {
  if (plan === 'max') return { ...PLAN_LIMITS.max, optimizations: maxMonthlyRuns() };
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function parseList(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Comped accounts: full access with no payment, granted by environment variable rather than
 * by a database flag. Deliberately env-based so it cannot be granted by anyone without deploy
 * access, needs no console clicking, and keeps working when Firestore does not — the owner's
 * own access should never depend on the billing system being healthy.
 *
 * UNLIMITED_EMAILS=you@example.com,friend@example.com
 * UNLIMITED_UIDS=abc123,def456
 *
 * For granting access to someone else later without a redeploy, set plan: 'unlimited' directly
 * on their user document instead. Both routes are honoured.
 */
export function isComped(uid, email) {
  const uids = parseList(process.env.UNLIMITED_UIDS);
  const emails = parseList(process.env.UNLIMITED_EMAILS);
  if (uid && uids.includes(String(uid).toLowerCase())) return true;
  if (email && emails.includes(String(email).toLowerCase())) return true;
  return false;
}

// Calendar month. "1,000 optimizations/month" reads as a calendar month to a customer, and a
// rolling window would need a per-event log rather than a counter.
function currentPeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Enforcement is deliberately opt-in. Until billing ships, a missing service account must not
// take down a working app, so the default is to count usage and allow everything while
// logging loudly. Set BILLING_ENFORCED=true and this flips to fail-closed: over-limit requests
// are refused, and no Firestore means no generation, because silently allowing unlimited
// paid-tier usage is the worse failure.
export const enforcementOn = () => String(process.env.BILLING_ENFORCED || '').toLowerCase() === 'true';

function planOf(data, comped) {
  if (comped) return 'unlimited';
  return ['paid', 'max', 'unlimited'].includes(data?.plan) ? data.plan : 'free';
}

// Two counters are kept side by side: `usage` resets every calendar month, `lifetimeUsage`
// never does. Both always move, so someone who cancels lands back on free with their true
// lifetime count rather than a fresh trial.
function countersFor(data, period) {
  const usage = data?.usage && data.usage.period === period ? { ...data.usage } : { period };
  const lifetime = { ...(data?.lifetimeUsage || {}) };
  return { usage, lifetime };
}

/**
 * The caller's plan and where they stand against its optimization allowance, from an already
 * loaded user document. Pure, so the status endpoint and the quota transaction agree.
 */
export function getEntitlement(user, data, kind = 'optimizations') {
  const comped = isComped(user?.uid, user?.email);
  const plan = planOf(data, comped);
  const limits = limitsFor(plan);
  const { usage, lifetime } = countersFor(data, currentPeriod());
  const used = Number((limits.window === 'lifetime' ? lifetime : usage)[kind] || 0);
  const limit = limits[kind] ?? null;
  return {
    plan,
    comped,
    window: limits.window,
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    // Mirrors profileCap() in firestore.rules, which is what actually enforces it.
    profileLimit: limits.profiles,
    historyVisible: limits.historyVisible,
    fairUse: Boolean(limits.fairUse),
    unlimitedProfiles: Boolean(limits.unlimitedProfiles),
    enforced: enforcementOn(),
  };
}

/**
 * Atomically check a user's allowance and consume one unit of it.
 *
 * @param {string} uid
 * @param {'optimizations'|'pdfImports'} kind
 * @returns {Promise<{allowed:boolean, reason?:string, plan:string, used:number, limit:number, window:string, enforced:boolean}>}
 */
export async function consumeQuota(uid, kind, { email = null } = {}) {
  const enforced = enforcementOn();
  const comped = isComped(uid, email);
  const database = db();

  // Checked before Firestore is even consulted, so a comped account keeps working when the
  // billing system does not.
  if (comped && !database) {
    return { allowed: true, plan: 'unlimited', used: 0, limit: null, window: 'month', enforced, comped };
  }

  if (!database) {
    if (enforced) {
      return { allowed: false, reason: 'quota_unavailable', plan: 'unknown', used: 0, limit: 0, enforced, comped };
    }
    return { allowed: true, plan: 'free', used: 0, limit: limitsFor('free')[kind], window: 'lifetime', enforced, comped };
  }

  const ref = database.collection('users').doc(uid);
  const period = currentPeriod();

  try {
    return await database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const storedPlan = planOf(data, false);
      const plan = planOf(data, comped);
      const limits = limitsFor(plan);
      const limit = limits[kind] ?? null;

      const { usage, lifetime } = countersFor(data, period);
      const counted = limits.window === 'lifetime' ? lifetime : usage;
      const used = Number(counted[kind] || 0);

      // null means no ceiling, so comped and paid-unlimited never trip this.
      if (limit != null && used >= limit) {
        return { allowed: false, reason: 'quota_exceeded', plan, used, limit, window: limits.window, enforced, comped };
      }

      // Mirror the env-based grant onto the document. firestore.rules cannot read env vars,
      // so without this a comped account would still be held to the free profile cap, and the
      // UI would still show upsells. Written by the server, denied to the client.
      if (comped && storedPlan !== 'unlimited') {
        tx.set(ref, { plan: 'unlimited', planSince: new Date().toISOString() }, { merge: true });
        console.log('[firestore] stamped comped plan for uid=%s', uid);
      }

      // Counted even when enforcement is off, so the numbers are real on the day it is
      // switched on and we can see actual usage before committing to the limits.
      usage[kind] = Number(usage[kind] || 0) + 1;
      lifetime[kind] = Number(lifetime[kind] || 0) + 1;
      tx.set(ref, { usage, lifetimeUsage: lifetime }, { merge: true });

      return { allowed: true, plan, used: used + 1, limit, window: limits.window, enforced, comped };
    });
  } catch (err) {
    console.error('[firestore] quota transaction failed for %s/%s: %s', uid, kind, err?.message || err);
    // A comped account is never blocked by a billing-system failure.
    if (comped) {
      return { allowed: true, plan: 'unlimited', used: 0, limit: null, window: 'month', enforced, comped };
    }
    if (enforced) {
      return { allowed: false, reason: 'quota_unavailable', plan: 'unknown', used: 0, limit: 0, enforced, comped };
    }
    return { allowed: true, plan: 'free', used: 0, limit: limitsFor('free')[kind], window: 'lifetime', enforced, comped };
  }
}

/**
 * Give back one unit consumed by consumeQuota, for a request that then failed. With only five
 * free optimizations, a model timeout must not eat one of them. Never throws.
 */
export async function refundQuota(uid, kind) {
  const database = db();
  if (!database) return;

  const ref = database.collection('users').doc(uid);
  const period = currentPeriod();
  try {
    await database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const { usage, lifetime } = countersFor(snap.data(), period);
      // Floor at zero: a refund that straddles a month boundary has nothing to give back.
      usage[kind] = Math.max(0, Number(usage[kind] || 0) - 1);
      lifetime[kind] = Math.max(0, Number(lifetime[kind] || 0) - 1);
      tx.set(ref, { usage, lifetimeUsage: lifetime }, { merge: true });
    });
    console.log('[firestore] refunded one %s to uid=%s', kind, uid);
  } catch (err) {
    console.error('[firestore] refund failed for %s/%s: %s', uid, kind, err?.message || err);
  }
}

/**
 * The stored user document, {} when there is none yet, or undefined when the server has no
 * Firestore access at all. Callers that need to tell those apart check for undefined.
 */
export async function getUserDoc(uid) {
  const database = db();
  if (!database) return undefined;
  const snap = await database.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : {};
}

// Server-side merge write. Used for the server-owned fields firestore.rules denies the client.
export async function updateUserDoc(uid, fields) {
  const database = db();
  if (!database) throw new Error('Firestore is not configured on the server');
  await database.collection('users').doc(uid).set(fields, { merge: true });
}

export async function findUidByStripeCustomer(customerId) {
  const database = db();
  if (!database || !customerId) return null;
  const snap = await database.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Record one successful run. Stores the structured result rather than a rendered PDF: the PDF
 * is derived, costs storage, and freezing it would stop old runs benefiting from later template
 * and prompt work. rendererVersion is stamped so a future change can be reasoned about.
 *
 * Never throws — a history write must not cost the user a generation they already paid for.
 */
export async function recordRun(uid, run) {
  const database = db();
  if (!database) return null;

  try {
    const ref = database.collection('users').doc(uid).collection('history').doc();
    await ref.set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      profileId: run.profileId || null,
      profileName: run.profileName || null,
      companyName: run.companyName || null,
      jobTitle: run.jobTitle || null,
      hasCoverLetter: Boolean(run.coverLetter),
      cv: run.cv || null,
      coverLetter: run.coverLetter || null,
      rendererVersion: run.rendererVersion || 1,
    });
    return ref.id;
  } catch (err) {
    console.error('[firestore] could not record run for %s: %s', uid, err?.message || err);
    return null;
  }
}

function isoTime(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

/**
 * Newest-first run metadata, without the CV bodies, so a history list stays small.
 * Returns null when the server has no Firestore access.
 */
export async function listRuns(uid, limit = 50) {
  const database = db();
  if (!database) return null;
  const snap = await database.collection('users').doc(uid).collection('history')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      createdAt: isoTime(d.createdAt),
      companyName: d.companyName || null,
      jobTitle: d.jobTitle || null,
      profileName: d.profileName || null,
      hasCoverLetter: Boolean(d.hasCoverLetter),
    };
  });
}

// How many runs are stored, or null when the server has no Firestore access.
export async function countRuns(uid) {
  const database = db();
  if (!database) return null;
  const snap = await database.collection('users').doc(uid).collection('history').count().get();
  return Number(snap.data().count || 0);
}

// One full run, or null if it does not exist (or Firestore is unavailable).
export async function getRun(uid, runId) {
  const database = db();
  if (!database) return null;
  const snap = await database.collection('users').doc(uid).collection('history').doc(runId).get();
  if (!snap.exists) return null;
  const d = snap.data();
  return { id: runId, ...d, createdAt: isoTime(d.createdAt) };
}
