import { adPixelsAllowed } from './adConsent.js';

// Reddit Pixel. Loads only when VITE_REDDIT_PIXEL_ID is set (Vercel: Production only), so
// local dev and preview builds send nothing to Reddit.
const PIXEL_ID = (import.meta.env.VITE_REDDIT_PIXEL_ID || '').trim();

// Reddit's standard base code, minus the hardcoded ID.
export const initRedditPixel = () => {
  if (!PIXEL_ID || typeof window === 'undefined' || window.rdt || !adPixelsAllowed()) return;
  /* eslint-disable */
  !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};
  p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;
  var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
  /* eslint-enable */
  window.rdt('init', PIXEL_ID);
  window.rdt('track', 'PageVisit');
};

// SignUp once, for an account that was just created (same rule as the Meta Pixel).
export const trackRedditSignUp = (isNewUser) => {
  if (!isNewUser || typeof window === 'undefined' || typeof window.rdt !== 'function') return;
  try {
    window.rdt('track', 'SignUp');
  } catch (err) {
    console.warn('[reddit pixel] SignUp failed: %s', err?.message || err);
  }
};

// Purchase once, when a checkout has just turned a free account into a paying one.
export const trackRedditPurchase = (value) => {
  if (typeof window === 'undefined' || typeof window.rdt !== 'function') return;
  try {
    window.rdt('track', 'Purchase', { value, currency: 'USD', itemCount: 1 });
  } catch (err) {
    console.warn('[reddit pixel] Purchase failed: %s', err?.message || err);
  }
};
