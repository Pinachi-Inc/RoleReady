import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  GithubAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, githubProvider, db } from '../src/firebase.js';

const METHOD_LABELS = {
  'google.com': 'Google',
  'github.com': 'GitHub',
  password: 'email and password',
};

// Short, user-facing text for the Firebase errors people actually hit. Returns null for
// errors that need no message (the user closed the popup themselves).
export const friendlyAuthError = (error) => {
  switch (error?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead, or reset your password.';
    case 'auth/weak-password':
      return 'Use a password of at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the sign-in popup. Allow popups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled yet.';
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists. Sign in the way you did before.';
    default:
      return 'Sign-in failed. Please try again.';
  }
};

// A popup sign-in whose email already belongs to an account made another way. We keep its
// credential here and attach it once the person signs in with their original method, so
// both methods then open the same account.
let pendingLink = null;

const credentialFromError = (providerId, error) => (
  providerId === 'github.com'
    ? GithubAuthProvider.credentialFromError(error)
    : GoogleAuthProvider.credentialFromError(error)
);

// Attach a held credential to the account that just signed in, if it is the same email.
const linkPendingCredential = async (user) => {
  if (!pendingLink || !user) return;
  const { credential, email } = pendingLink;
  if (email && user.email && email.toLowerCase() !== user.email.toLowerCase()) return;
  pendingLink = null;
  try {
    await linkWithCredential(user, credential);
  } catch (error) {
    // Already linked, or the credential expired. Sign-in itself still succeeded.
    console.warn('[auth] could not link the pending credential: %s', error?.code || error?.message);
  }
};

// Builds the error thrown for account-exists-with-different-credential: holds the credential
// for linking and names the method the email already uses where Firebase will say.
const accountExistsError = async (providerId, error) => {
  const email = error?.customData?.email || null;
  const credential = credentialFromError(providerId, error);
  if (credential) pendingLink = { credential, email, providerId };

  let methods = [];
  if (email) {
    try {
      // Empty when email enumeration protection is on; we then fall back to a generic hint.
      methods = await fetchSignInMethodsForEmail(auth, email);
    } catch {
      methods = [];
    }
  }
  const existing = methods.map((m) => METHOD_LABELS[m]).filter(Boolean);
  const via = existing.length ? existing.join(' or ') : 'the method you used before';
  const linked = METHOD_LABELS[providerId] || 'this method';
  const err = new Error(
    `${email || 'This email'} already has a RoleBerry account. Sign in with ${via} and we will link ${linked} to it.`
  );
  err.code = error.code;
  err.friendly = err.message;
  return err;
};

const popupSignIn = async (provider, providerId) => {
  try {
    const result = await signInWithPopup(auth, provider);
    await linkPendingCredential(result.user);
    return result.user;
  } catch (error) {
    if (error?.code === 'auth/account-exists-with-different-credential') {
      throw await accountExistsError(providerId, error);
    }
    throw error;
  }
};

// Sign in with Google
export const signInWithGoogle = () => popupSignIn(googleProvider, 'google.com');

// Sign in with GitHub
export const signInWithGithub = () => popupSignIn(githubProvider, 'github.com');

// Sign in with an email and password
export const signInWithEmail = async (email, password) => {
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  await linkPendingCredential(result.user);
  return result.user;
};

// Create an email and password account and send the verification email.
export const signUpWithEmail = async (email, password, displayName) => {
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const name = (displayName || '').trim();
  if (name) await updateProfile(result.user, { displayName: name });
  await sendEmailVerification(result.user);
  return result.user;
};

// Send a password reset email.
export const sendPasswordReset = (email) => sendPasswordResetEmail(auth, email.trim());

// Send the verification email again to the signed-in user.
export const resendVerification = async () => {
  if (!auth.currentUser) throw new Error('You must be signed in to do this.');
  await sendEmailVerification(auth.currentUser);
};

// Re-read the signed-in user after they clicked the link in their inbox. Forces a fresh ID
// token so the server sees email_verified. Returns true once the email is verified.
export const refreshEmailVerified = async () => {
  const current = auth.currentUser;
  if (!current) return false;
  await current.reload();
  if (current.emailVerified) await current.getIdToken(true);
  return auth.currentUser?.emailVerified === true;
};

// Password accounts must confirm their email before using the app; the server refuses their
// tokens until they do.
export const needsEmailVerification = (user) => (
  !!user && !user.emailVerified && (user.providerData || []).some((p) => p.providerId === 'password')
);

// Sign out
export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

// Listen to auth state changes
export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// Firebase ID token for the current user, used as the API bearer token.
// Returns null when nobody is signed in.
export const getIdToken = async () => {
  const current = auth.currentUser;
  if (!current) return null;
  return current.getIdToken();
};

// Authorization header for API calls. Throws if the user is not signed in,
// since every API route now requires a verified token.
export const getAuthHeaders = async () => {
  const token = await getIdToken();
  if (!token) throw new Error('You must be signed in to do this.');
  return { Authorization: `Bearer ${token}` };
};

// Save user data to Firestore
export const saveUserData = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, userData, { merge: true });
    console.log('User data saved successfully');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
};

// Get user data from Firestore
export const getUserData = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    } else {
      console.log('No user data found');
      return null;
    }
  } catch (error) {
    console.error('Error getting user data:', error);
    throw error;
  }
};
