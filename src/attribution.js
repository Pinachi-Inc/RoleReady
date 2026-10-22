// Where a visitor first came from, saved on their account when they sign up, so sign-ups can
// be counted per ad channel (npm run signups). First party only: it lives in this browser's
// localStorage until sign-up and is never sent to Meta or Reddit.

const KEY = 'rb_first_touch';
const MAX_AGE_DAYS = 90;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
// Ad click ids, used to name the source when a link carries no utm_source.
const CLICK_IDS = { rdt_cid: 'reddit', fbclid: 'meta', gclid: 'google', li_fat_id: 'linkedin' };

const clip = (value, max = 200) => (value == null ? null : String(value).slice(0, max));

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};

// One short lowercase label to count by: the utm_source, else the ad network a click id
// belongs to, else the referring site, else "direct".
export const sourceLabel = (touch) => {
  if (!touch) return 'direct';
  if (touch.utm_source) return String(touch.utm_source).trim().toLowerCase().slice(0, 60);
  if (touch.click_id && CLICK_IDS[touch.click_id]) return CLICK_IDS[touch.click_id];
  if (touch.referrer_host) return touch.referrer_host;
  return 'direct';
};

// Which ad channel a source label belongs to, for the three-line report: meta, reddit or other.
const CHANNELS = {
  meta: ['meta', 'facebook', 'fb', 'instagram', 'ig', 'facebook.com', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com', 'instagram.com', 'l.instagram.com'],
  reddit: ['reddit', 'reddit.com', 'old.reddit.com', 'out.reddit.com'],
};
export const channelOf = (source) => {
  const s = String(source || '').toLowerCase();
  for (const [channel, names] of Object.entries(CHANNELS)) if (names.includes(s)) return channel;
  return 'other';
};

// Reads the landing URL and referrer. Returns a touch, or null when the visit says nothing
// about where it came from (typed URL, bookmark, a link inside our own site).
export const touchFromVisit = (href, referrer, now = new Date()) => {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const touch = {};
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key);
    if (value) touch[key] = clip(value, 100);
  }
  const clickId = Object.keys(CLICK_IDS).find((id) => url.searchParams.has(id));
  if (clickId) touch.click_id = clickId;

  const refHost = referrer ? hostOf(referrer) : null;
  const ownHost = url.hostname.replace(/^www\./, '').toLowerCase();
  if (refHost && refHost !== ownHost) {
    touch.referrer_host = refHost;
    // Origin and path only; a query string can carry someone else's tokens.
    try {
      const r = new URL(referrer);
      touch.referrer = clip(`${r.origin}${r.pathname}`, 200);
    } catch {
      /* keep the host only */
    }
  }
  if (!Object.keys(touch).length) return null;
  touch.landing_path = clip(url.pathname, 100);
  touch.first_seen = now.toISOString();
  return touch;
};

const readStored = (now = new Date()) => {
  const store = storage();
  if (!store) return null;
  try {
    const touch = JSON.parse(store.getItem(KEY) || 'null');
    if (!touch || !touch.first_seen) return null;
    const ageDays = (now - new Date(touch.first_seen)) / 86400000;
    if (!(ageDays <= MAX_AGE_DAYS)) {
      store.removeItem(KEY);
      return null;
    }
    return touch;
  } catch {
    return null;
  }
};

// Call once on every page load. Keeps the first touch: a later visit never overwrites it.
export const captureFirstTouch = () => {
  if (typeof window === 'undefined') return;
  if (readStored()) return;
  const touch = touchFromVisit(window.location.href, document.referrer);
  if (!touch) return;
  try {
    storage()?.setItem(KEY, JSON.stringify(touch));
  } catch {
    /* storage full or blocked: this visit just goes uncounted */
  }
};

// The fields saved on users/{uid}.signupSource when an account is created.
export const signupSourceRecord = (touch, method, now = new Date()) => ({
  source: sourceLabel(touch),
  utm_source: touch?.utm_source || null,
  utm_medium: touch?.utm_medium || null,
  utm_campaign: touch?.utm_campaign || null,
  utm_content: touch?.utm_content || null,
  utm_term: touch?.utm_term || null,
  click_id: touch?.click_id || null,
  referrer: touch?.referrer || null,
  landing_path: touch?.landing_path || null,
  first_seen: touch?.first_seen || null,
  method: method || null,
  signedUpAt: now.toISOString(),
});

// The stored first touch for this browser, or null.
export const currentFirstTouch = () => (typeof window === 'undefined' ? null : readStored());
