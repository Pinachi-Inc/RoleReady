import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../src/firebase.js';

// Sign in with Google
export const signInWithGoogle = async () => {
  try {
    console.log('🔐 Starting Google sign-in...');
    console.log('🔧 Auth object:', auth);
    console.log('🔧 Google provider:', googleProvider);
    
    const result = await signInWithPopup(auth, googleProvider);
    
    console.log('✅ Sign-in successful!');
    console.log('👤 User:', result.user);
    console.log('🎫 Credential:', result.credential);
    
    return result.user;
  } catch (error) {
    console.error('❌ Error signing in with Google:', error);
    console.error('📋 Error code:', error.code);
    console.error('📋 Error message:', error.message);
    console.error('📋 Full error object:', error);
    throw error;
  }
};

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
