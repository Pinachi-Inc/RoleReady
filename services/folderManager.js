const DB_NAME = 'roleberry';
const STORE_NAME = 'settings';
const HANDLE_KEY = 'downloadFolderHandle';

// Handle kept for the life of the page once permission is granted, so repeat
// downloads skip both the IndexedDB read and the permission round-trip.
let _liveHandle = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    // Another tab holding an older version blocks the upgrade. Unhandled, this
    // promise simply never settles.
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

async function getStoredHandle() {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function storeHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
      // An aborted transaction fires onabort, not onerror. Without this the promise
      // never settled — the exact failure that wedged the folder picker.
      tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearFolderHandle() {
  // Drop the in-memory copy too, or the "cleared" folder keeps being written to for
  // the rest of the page session.
  _liveHandle = null;
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export function isFolderApiSupported() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// No shared/cached picker promise. There used to be one, and it was the bug: if the
// first dialog was never answered (opened behind the window, or left pending by the
// browser) its promise stayed pending forever, and every later call returned that
// same dead promise WITHOUT calling the browser. The button went silent — no dialog,
// no error, nothing to see. Chrome already rejects a second concurrent picker with a
// real error, and that error is far more useful than a promise that never settles.
export const PICKER_TIMEOUT = 'PICKER_TIMEOUT';

async function openDirectoryPicker() {
  console.log('[folder] requesting directory picker');
  let handle;
  try {
    // `id` and `startIn` matter more than they look.
    //
    // Chrome keeps a "recently picked directory map" keyed BY ORIGIN. With no id, every
    // picker on this origin shares one remembered location, and if that location has
    // become unreachable — deleted, renamed, an unmounted or unsynced volume — the
    // picker has nowhere valid to open. That is per-origin state, which is exactly why
    // localhost behaves differently from production with identical code.
    //
    // Passing an `id` gives this picker its own entry in that map, sidestepping a
    // poisoned default. `startIn` supplies a known-good location the first time that
    // id is used. Docs: developer.chrome.com/docs/capabilities/web-apis/file-system-access
    handle = await withTimeout(
      window.showDirectoryPicker({ mode: 'readwrite', id: 'roleberry-cv', startIn: 'documents' }),
      12000
    );
  } catch (err) {
    if (/timeout/i.test(err?.message || '')) {
      console.warn('[folder] picker never answered within 12s — giving up on the folder');
      const timeoutErr = new Error(PICKER_TIMEOUT);
      timeoutErr.name = PICKER_TIMEOUT;
      throw timeoutErr;
    }
    console.warn('[folder] picker rejected: %s — %s', err?.name || 'Error', err?.message || err);
    throw err;
  }

  console.log('[folder] picker returned "%s"', handle?.name);
  _liveHandle = handle;

  // Remembering the folder is a side effect and must never gate the handle the
  // caller is waiting for.
  withTimeout(storeHandle(handle), 3000).catch((err) => {
    console.warn('[folder] chose "%s" but could not remember it for next time: %s',
      handle.name, err?.message || err);
  });

  return handle;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
  ]);
}

// A handle restored from IndexedDB comes back in the "prompt" permission state on
// every page load. Without re-requesting, any read/write on it throws and the
// stored folder is silently useless. requestPermission needs transient activation,
// which is why getFolderHandle() must be called straight from a click handler.
// Returns 'granted' | 'denied' | 'timeout'. The distinction matters: on 'timeout'
// the click's transient activation is already spent, so any file picker attempted
// afterwards can only throw SecurityError — better to fail fast and let the caller
// fall back to a plain download than to make the user wait for a guaranteed failure.
async function ensureReadWritePermission(handle) {
  if (!handle || typeof handle.queryPermission !== 'function') return 'denied';
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return 'granted';
    // Chrome can leave this pending forever when it declines to show the prompt, or
    // when the user has dismissed it enough times that it is auto-suppressed. Keep
    // the wait short: the download matters more than the folder.
    const result = await withTimeout(handle.requestPermission(opts), 8000);
    return result === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    const timedOut = /timeout/i.test(err?.message || '');
    console.warn('[folder] write permission %s: %s', timedOut ? 'timed out' : 'refused', err?.name || err?.message || err);
    return timedOut ? 'timeout' : 'denied';
  }
}

async function getOrPickFolder() {
  // Try to reuse a previously stored handle (timeout on the IndexedDB read only —
  // the permission prompt is user-paced and must not be raced).
  // Reuse an in-memory handle when we already have one: skips the IndexedDB read and
  // the permission round-trip entirely on repeat downloads in the same page session.
  if (_liveHandle) {
    const cached = await ensureReadWritePermission(_liveHandle);
    if (cached === 'granted') return _liveHandle;
    _liveHandle = null;
  }

  try {
    const stored = await withTimeout(getStoredHandle(), 2000);
    if (stored) {
      const state = await ensureReadWritePermission(stored);
      if (state === 'granted') {
        _liveHandle = stored;
        return stored;
      }
      if (state === 'timeout') {
        // The gesture is spent. Opening a picker now throws SecurityError after a
        // pointless wait, so bail and let the caller download normally.
        throw new Error('Folder permission prompt did not answer in time');
      }
      console.warn('[folder] write permission for "%s" was not granted; asking for a folder again', stored.name);
    }
  } catch (err) {
    if (/did not answer in time/.test(err?.message || '')) throw err;
    console.warn('[folder] could not reuse the stored folder handle:', err);
  }

  return openDirectoryPicker();
}

// Windows device names, which some filesystems still refuse as directory names.
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// getDirectoryHandle rejects "", ".", ".." and anything containing a path separator or
// NUL. Filesystems reject more than that: the Windows set <>:"|?*, control characters,
// and trailing dots or spaces. Strip all of it, then assert the result is legal so no
// future edit here can hand the browser a name it refuses.
function sanitizeFolderName(name) {
  let out = String(name || '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '')          // path separators and Windows-illegal chars
    .replace(/[\x00-\x1f\x7f]/g, '')        // control characters, including DEL
    .trim()
    .replace(/\s+/g, '_')                   // collapse whitespace
    .replace(/^[.\s_]+|[.\s_]+$/g, '')      // no leading/trailing dots, spaces, underscores
    .slice(0, 50)
    .replace(/[.\s_]+$/g, '');              // the slice can re-expose one

  if (!out || RESERVED_NAMES.test(out)) out = 'Company';

  // Final gate. If anything above ever lets an illegal name through, fail safe here
  // rather than at the browser, where it throws TypeError and kills the download.
  if (out === '.' || out === '..' || /[/\\\x00]/.test(out)) out = 'Company';

  return out;
}

export function extractCompanyName(jobDescription) {
  if (!jobDescription) return 'Company';
  const lines = String(jobDescription).split('\n').map(l => l.trim()).filter(Boolean);

  // Look for "at CompanyName" pattern in first 5 lines
  for (const line of lines.slice(0, 5)) {
    const m = line.match(/\bat\s+([A-Z][a-zA-Z0-9&.\s]{1,30}?)(?:\s*[,.(]|$)/);
    if (m) return sanitizeFolderName(m[1].trim());
  }

  // Fall back to first short line (likely a header with company/job title)
  for (const line of lines.slice(0, 3)) {
    if (line.length <= 40) return sanitizeFolderName(line);
  }

  return sanitizeFolderName(lines[0].slice(0, 40)) || 'Company';
}

// Each download gets its own folder: Acme, then Acme_2, Acme_3, … Existing
// versions are kept rather than overwritten.
async function createUniqueUnder(rootHandle, sanitized) {
  let candidate = sanitized;
  let i = 2;
  while (true) {
    try {
      await rootHandle.getDirectoryHandle(candidate, { create: false });
      candidate = `${sanitized}_${i++}`;
    } catch (err) {
      if (err && err.name !== 'NotFoundError') throw err;
      return rootHandle.getDirectoryHandle(candidate, { create: true });
    }
  }
}

async function getUniqueSubfolder(rootHandle, baseName) {
  const sanitized = sanitizeFolderName(baseName);
  try {
    return await createUniqueUnder(rootHandle, sanitized);
  } catch (err) {
    // A name the browser refuses must not cost the user their download. Sanitising
    // should prevent this, but the set of rejected names varies by OS and filesystem,
    // so fall back to a name that is always legal rather than failing the write.
    if (err?.name === 'TypeError') {
      console.warn('[folder] the browser refused the folder name "%s" (%s); using "Company" instead',
        sanitized, err.message);
      return createUniqueUnder(rootHandle, 'Company');
    }
    throw err;
  }
}

export async function savePdfToFolder(blob, companyName, filename) {
  const rootHandle = await getOrPickFolder();
  return writePdfToHandle(blob, rootHandle, companyName, filename);
}

// Returns the folder the file actually landed in. Callers need this: each download
// creates a new numbered folder (Acme, Acme_2, Acme_3 …), so "where did it go" is
// not something the user can infer from the company name they typed.
export async function writePdfWithHandle(blob, rootHandle, companyName, filename) {
  return writePdfToHandle(blob, rootHandle, companyName, filename);
}

async function writePdfToHandle(blob, rootHandle, companyName, filename) {
  const subHandle = await getUniqueSubfolder(rootHandle, companyName);
  const fileHandle = await subHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();

  // Read it back. createWritable/close can resolve without the bytes landing —
  // a revoked permission, a full disk, or a swap-file commit that never happened.
  // Without this check a no-op write reported success and the caller skipped the
  // download fallback, so the user got no file anywhere.
  const written = await fileHandle.getFile();
  if (!written || written.size === 0) {
    throw new Error(`Wrote 0 bytes to ${subHandle.name}/${filename}`);
  }

  return { folder: subHandle.name, root: rootHandle.name, filename, size: written.size };
}

// Call this early in a user-gesture handler to request permission before async work.
export async function getFolderHandle() {
  return getOrPickFolder();
}

// Returns the current folder name without triggering a picker, or null.
// Prefers the in-memory handle: persistence is deliberately fire-and-forget, so an
// IndexedDB read immediately after a pick can legitimately still return nothing.
export async function getStoredFolderName() {
  if (_liveHandle?.name) return _liveHandle.name;
  try {
    const stored = await withTimeout(getStoredHandle(), 2000);
    return stored ? stored.name : null;
  } catch { return null; }
}

// Synchronous, for render paths that must not flicker through null.
export function getLiveFolderName() {
  return _liveHandle?.name || null;
}

// Pick a new folder (always shows picker), stores it, returns the handle.
// Always shows the picker so the user can deliberately change folder.
export async function pickNewFolder() {
  return openDirectoryPicker();
}
