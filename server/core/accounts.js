import admin from 'firebase-admin';
import axios from 'axios';
import { adminApp, adminDb } from './firestore.js';

// Admin-only account tools behind `npm run users` (scripts/users.mjs): list every account, and
// delete one completely. The Privacy Policy promises that a deleted account is gone within 30
// days, so deleting covers everything stored about the person:
//   - the Lemon Squeezy subscription, cancelled so they are not billed again
//   - users/{uid} with its history subcollection (profiles, usage, plan, every run)
//   - their feedback reports and the feedback rate-limit counter
//   - the Firebase Auth account itself
// Lemon Squeezy keeps its own payment and tax records, as the Privacy Policy says.

function requireAdmin() {
  const app = adminApp();
  const database = adminDb();
  if (!app || !database) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set, so accounts cannot be read or deleted.');
  return { auth: admin.auth(app), database };
}

const isoOrNull = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Every Firebase Auth account, joined with its user document.
 * Returns [{ uid, email, verified, providers, createdAt, lastSignInAt, plan, comped,
 *            subscriptionId, subscriptionStatus, signupSource }], newest first.
 */
export async function listAccounts() {
  const { auth, database } = requireAdmin();
  const records = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    records.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  const docs = new Map();
  const refs = records.map((r) => database.collection('users').doc(r.uid));
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await database.getAll(...refs.slice(i, i + 300));
    for (const snap of snaps) if (snap.exists) docs.set(snap.id, snap.data());
  }

  return records
    .map((r) => {
      const d = docs.get(r.uid) || {};
      return {
        uid: r.uid,
        email: r.email || null,
        verified: Boolean(r.emailVerified),
        providers: (r.providerData || []).map((p) => p.providerId),
        createdAt: isoOrNull(r.metadata?.creationTime),
        lastSignInAt: isoOrNull(r.metadata?.lastSignInTime),
        plan: d.plan || 'free',
        comped: d.comped === true,
        subscriptionId: d.billingSubscriptionId || null,
        subscriptionStatus: d.subscriptionStatus || null,
        signupSource: d.signupSource?.source || null,
      };
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// The uid for an email or a uid, or null when there is no such account.
export async function resolveAccount(emailOrUid) {
  const { auth } = requireAdmin();
  const value = String(emailOrUid || '').trim();
  if (!value) return null;
  try {
    return value.includes('@') ? await auth.getUserByEmail(value.toLowerCase()) : await auth.getUser(value);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') return null;
    throw err;
  }
}

// Cancel a subscription in Lemon Squeezy. A subscription the current API key cannot see (a
// test-mode one, once the key is live) or one already gone is reported, not treated as failure.
async function cancelSubscription(id) {
  const key = String(process.env.LEMONSQUEEZY_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
  if (!key) return 'skipped: LEMONSQUEEZY_API_KEY not set';
  try {
    await axios.delete(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${key}` },
      timeout: 15_000,
    });
    return 'cancelled';
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404) return 'not found with this API key (test-mode or already removed)';
    throw new Error(`Lemon Squeezy refused to cancel subscription ${id} (${status || err?.message})`);
  }
}

/**
 * Delete one account and everything stored about it. Returns a summary of what was done.
 * Stops before touching any data if the subscription cannot be cancelled, so nobody is left
 * paying for an account that no longer exists.
 */
export async function deleteAccount(uid) {
  const { auth, database } = requireAdmin();
  const userRef = database.collection('users').doc(uid);
  const snap = await userRef.get();
  const data = snap.exists ? snap.data() : {};

  const summary = { uid, subscription: 'none', feedbackReports: 0 };
  if (data.billingSubscriptionId && !['expired', 'cancelled'].includes(data.subscriptionStatus)) {
    summary.subscription = await cancelSubscription(data.billingSubscriptionId);
  }

  // users/{uid} and everything under it (history).
  await database.recursiveDelete(userRef);

  const reports = await database.collection('feedback').where('uid', '==', uid).get();
  for (const doc of reports.docs) await database.recursiveDelete(doc.ref);
  summary.feedbackReports = reports.size;
  await database.collection('feedbackLimits').doc(`uid_${uid}`).delete();

  try {
    await auth.deleteUser(uid);
    summary.auth = 'deleted';
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
    summary.auth = 'already gone';
  }
  return summary;
}
