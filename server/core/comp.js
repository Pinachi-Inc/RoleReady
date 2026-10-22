import {
  getAuthUserByEmail,
  getUserDoc,
  setCompFlag,
  updateUserDoc,
  listCompedDocs,
  isComped,
} from './firestore.js';
import { resyncPlanFromBilling } from './billing.js';

// Complimentary Max, granted by email. Used by scripts/comp.mjs (npm run comp); kept here so
// the e2e harness can run it against the in-memory Firestore.
//
// A comp is the `comped` flag on the user document, next to `plan`, which only ever records
// what Lemon Squeezy says. Granting sets the flag. Revoking clears it and re-reads the
// subscription from Lemon Squeezy, so the
// account lands on whatever it actually pays for, free if nothing. Neither touches profiles,
// history or usage.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalise(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(e)) throw new Error(`Not an email address: ${email}`);
  return e;
}

async function requireAccount(email) {
  const record = await getAuthUserByEmail(email);
  if (!record) {
    throw new Error(`${email} has not signed in to Roleberry yet. Ask them to sign in once, or add them to COMP_MAX_EMAILS instead.`);
  }
  return record;
}

export async function grantComp(rawEmail) {
  const email = normalise(rawEmail);
  const { uid } = await requireAccount(email);
  await setCompFlag(uid, true, { email });
  return { email, uid, plan: 'max', comped: true };
}

export async function revokeComp(rawEmail) {
  const email = normalise(rawEmail);
  const { uid } = await requireAccount(email);
  const stored = (await getUserDoc(uid)) || {};
  await setCompFlag(uid, false);
  // The old way of storing a comp overwrote plan itself; put back the truth before re-syncing.
  if (stored.plan === 'unlimited') await updateUserDoc(uid, { plan: 'free' });
  const plan = await resyncPlanFromBilling(uid);
  return {
    email,
    uid,
    plan,
    // Still Max regardless of the flag: the env allowlist names them.
    stillAllowlisted: isComped(uid, email),
  };
}

export async function listComps() {
  const docs = await listCompedDocs();
  const granted = docs.map((d) => ({
    uid: d.uid,
    email: d.compedEmail || null,
    since: d.compedAt || null,
    billingPlan: d.plan === 'paid' || d.plan === 'max' ? d.plan : 'free',
    legacy: d.plan === 'unlimited',
  }));
  const allowlist = String(process.env.COMP_MAX_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return { granted, allowlist };
}
