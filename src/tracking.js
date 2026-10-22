import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { trackSignUp as trackMetaSignUp } from './metaPixel.js';
import { trackRedditSignUp } from './redditPixel.js';
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
