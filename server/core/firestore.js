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
export const PLAN_LIMITS = {
  free: { optimizations: 15, pdfImports: 10, profiles: 1, historyVisible: 3, historyGreyed: 5 },
  paid: { optimizations: 1000, pdfImports: 10, profiles: 3, historyVisible: null, historyGreyed: 0 },
  unlimited: { optimizations: null, pdfImports: null, profiles: 10, historyVisible: null, historyGreyed: 0 },
};

export function limitsFor(plan) {
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

// Calendar month. "15 optimizations/month" reads as a calendar month to a customer, and a
// rolling window would need a per-event log rather than a counter.
function currentPeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Enforcement is deliberately opt-in. Until billing ships, a missing service account must not
// take down a working app, so the default is to count nothing and allow everything while
// logging loudly. Set BILLING_ENFORCED=true and this flips to fail-closed: no Firestore means
// no generation, because silently allowing unlimited paid-tier usage is the worse failure.
const enforcementOn = () => String(process.env.BILLING_ENFORCED || '').toLowerCase() === 'true';

/**
 * Atomically check a user's monthly allowance and consume one unit of it.
 *
 * @param {string} uid
 * @param {'optimizations'|'pdfImports'} kind
 * @returns {Promise<{allowed:boolean, reason?:string, plan:string, used:number, limit:number, enforced:boolean}>}
 */
export async function consumeQuota(uid, kind, { email = null } = {}) {
  const enforced = enforcementOn();
  const comped = isComped(uid, email);
  const database = db();

  // Checked before Firestore is even consulted, so a comped account keeps working when the
  // billing system does not.
  if (comped && !database) {
    return { allowed: true, plan: 'unlimited', used: 0, limit: null, enforced, comped };
  }

  if (!database) {
    if (enforced) {
      return { allowed: false, reason: 'quota_unavailable', plan: 'unknown', used: 0, limit: 0, enforced, comped };
    }
    return { allowed: true, plan: 'free', used: 0, limit: limitsFor('free')[kind], enforced, comped };
  }

  const ref = database.collection('users').doc(uid);
  const period = currentPeriod();

  try {
    return await database.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const storedPlan = data.plan === 'paid' || data.plan === 'unlimited' ? data.plan : 'free';
      const plan = comped ? 'unlimited' : storedPlan;
      const limit = limitsFor(plan)[kind];

      // A new period resets every counter rather than just the one being consumed.
      const usage = data.usage && data.usage.period === period ? { ...data.usage } : { period };
      const used = Number(usage[kind] || 0);

      // null means no ceiling, so comped and paid-unlimited never trip this.
      if (limit != null && used >= limit) {
        return { allowed: false, reason: 'quota_exceeded', plan, used, limit, enforced, comped };
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
      usage[kind] = used + 1;
      tx.set(ref, { usage }, { merge: true });

      return { allowed: true, plan, used: used + 1, limit, enforced, comped };
    });
  } catch (err) {
    console.error('[firestore] quota transaction failed for %s/%s: %s', uid, kind, err?.message || err);
    // A comped account is never blocked by a billing-system failure.
    if (comped) {
      return { allowed: true, plan: 'unlimited', used: 0, limit: null, enforced, comped };
    }
    if (enforced) {
      return { allowed: false, reason: 'quota_unavailable', plan: 'unknown', used: 0, limit: 0, enforced, comped };
    }
    return { allowed: true, plan: 'free', used: 0, limit: limitsFor('free')[kind], enforced, comped };
  }
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
