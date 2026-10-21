import { getAuthHeaders } from './auth.js';
import { auth } from '../src/firebase.js';

async function postHistory(body) {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `History request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

// In-memory cache so History opens instantly after the first load. The list is shown from
// cache straight away and refreshed in the background (a new run shows up a moment later).
// Everything is keyed by uid, so switching accounts never shows someone else's runs, and
// nothing is written to disk.
const currentUid = () => auth.currentUser?.uid || null;

let listCache = { uid: null, data: null, at: 0 };
let listInFlight = null;
const runCache = new Map(); // `${uid}:${runId}` -> run. Runs never change once saved.
const RUN_CACHE_MAX = 20;

// { runs: [{ id, createdAt, companyName, jobTitle, profileName, hasCoverLetter }],
//   visibleLimit, lockedCount, lockedRuns: [{ createdAt }] }
// Paid: visibleLimit null, nothing locked. Free: the newest runs in full, older ones as stubs.
export const listHistory = () => {
  const uid = currentUid();
  if (listInFlight && listInFlight.uid === uid) return listInFlight.promise;
  const promise = postHistory({})
    .then((data) => {
      if (currentUid() === uid) listCache = { uid, data, at: Date.now() };
      return data;
    })
    .finally(() => {
      if (listInFlight?.promise === promise) listInFlight = null;
    });
  listInFlight = { uid, promise };
  return promise;
};

// The last list fetched for the signed-in user, or null.
export const cachedHistory = () => {
  const uid = currentUid();
  return uid && listCache.uid === uid ? listCache.data : null;
};

// Warms the cache (and the server function) ahead of a visit to History. Never throws.
// Skips the call when a fresh list is already cached or on its way.
export const prefetchHistory = (maxAgeMs = 30_000) => {
  const uid = currentUid();
  if (!uid) return;
  if (listCache.uid === uid && Date.now() - listCache.at < maxAgeMs) return;
  listHistory().catch(() => {});
};

// { id, createdAt, companyName, jobTitle, profileName, cv, cvContent, coverLetter }
export const getHistoryRun = async (id) => {
  const key = `${currentUid()}:${id}`;
  if (runCache.has(key)) return runCache.get(key);
  const { run } = await postHistory({ id });
  if (runCache.size >= RUN_CACHE_MAX) runCache.delete(runCache.keys().next().value);
  runCache.set(key, run);
  return run;
};
