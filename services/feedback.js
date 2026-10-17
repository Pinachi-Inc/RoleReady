import { getIdToken } from './auth.js';

// Feedback and problem reports. The widget is mounted once in src/main.jsx; anything else in
// the app opens it through openFeedback(), and records errors worth attaching to a report
// through recordAppError().

const MAX_ERRORS = 10;
const recentErrors = [];
let captureInstalled = false;

// Signed out (or a token refresh that fails) still sends, anonymously: a report must never be
// lost because the session is in a bad state, which is often the very thing being reported.
async function authHeader() {
  try {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Resolves { ok: true, ref }. Errors carry the server's message, plus status and code.
export async function sendFeedback(payload) {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Feedback request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code || null;
    throw error;
  }
  return data;
}

// Opens the Feedback dialog from anywhere. preset may carry { type, message }.
export function openFeedback(preset = {}) {
  window.dispatchEvent(new CustomEvent('roleberry:feedback', { detail: preset }));
}

// The last few errors the app hit, sent with a report so we can see what went wrong without
// asking the reporter to dig through devtools.
export function recordAppError(message) {
  recentErrors.push(`${new Date().toISOString()} ${String(message).slice(0, 300)}`);
  if (recentErrors.length > MAX_ERRORS) recentErrors.splice(0, recentErrors.length - MAX_ERRORS);
}

export function getRecentErrors() {
  return [...recentErrors];
}

// Uncaught errors and rejections only. console.error is left alone: the app logs plenty there
// that is not a failure, and some of it is the user's own CV text.
export function installErrorCapture() {
  if (captureInstalled) return;
  captureInstalled = true;
  window.addEventListener('error', (event) => recordAppError(event.message));
  window.addEventListener('unhandledrejection', (event) => {
    recordAppError(event.reason?.message || String(event.reason));
  });
}
