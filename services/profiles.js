import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../src/firebase.js';

// Saved profiles live on the user document as a map, `profiles.{id}`, next to the single
// working profile (aiUserInfo / fixedUserInfo) that every account has. Saving a profile
// snapshots the working profile; switching copies a snapshot back into it. The cap (free 0,
// paid 3) is enforced by firestore.rules, so a write over it is rejected there, not here.

const userRef = (uid) => doc(db, 'users', uid);

export const newProfileId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);

// Creates or overwrites one profile and makes it the active one.
export const saveProfile = async (uid, id, { name, aiUserInfo, fixedUserInfo }) => {
  await setDoc(userRef(uid), {
    profiles: { [id]: { name, aiUserInfo, fixedUserInfo, updatedAt: new Date().toISOString() } },
    activeProfileId: id
  }, { merge: true });
};

export const renameProfile = async (uid, id, name) => {
  await setDoc(userRef(uid), { profiles: { [id]: { name } } }, { merge: true });
};

export const deleteProfile = async (uid, id, { wasActive = false } = {}) => {
  await updateDoc(userRef(uid), {
    [`profiles.${id}`]: deleteField(),
    ...(wasActive ? { activeProfileId: deleteField() } : {})
  });
};

// Switching also writes the profile into the working fields, so a reload lands on it.
export const activateProfile = async (uid, id, { aiUserInfo, fixedUserInfo }) => {
  await setDoc(userRef(uid), {
    aiUserInfo,
    fixedUserInfo,
    activeProfileId: id,
    lastUpdated: new Date().toISOString()
  }, { merge: true });
};
