import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { trackSignUp as trackMetaSignUp, trackPurchase as trackMetaPurchase } from './metaPixel.js';
import { trackRedditSignUp, trackRedditPurchase } from './redditPixel.js';
import { currentFirstTouch, signupSourceRecord } from './attribution.js';

// Everything that happens when an account is created: the two ad pixels, and the first-touch
// source saved on the account. `isNewUser` is Firebase's getAdditionalUserInfo(result).isNewUser
// (true only on the sign-in that created the account), so returning users are never counted.
// Never throws and never holds up sign-in.
export const trackSignUp = (isNewUser, method, user) => {
  if (!isNewUser) return;
  trackMetaSignUp(true, method);
  trackRedditSignUp(true);
  if (!user?.uid) return;
  const record = signupSourceRecord(currentFirstTouch(), method);
  setDoc(doc(db, 'users', user.uid), { signupSource: record }, { merge: true }).catch((err) => {
    console.warn('[signup source] not saved: %s', err?.code || err?.message || err);
  });
};

// Monthly prices, as sold (components/PricingModal.jsx). Plans as stored: 'paid' is Pro.
const PLAN_PRICE_USD = { paid: 12, max: 49 };

// A checkout just activated a subscription. Called once, on the return from Polar,
// after the server confirms the plan, so an abandoned or failed checkout never counts.
export const trackPurchase = (plan) => {
  const value = PLAN_PRICE_USD[plan];
  if (!value) return;
  trackMetaPurchase(plan === 'max' ? 'Max' : 'Pro', value);
  trackRedditPurchase(value);
};
