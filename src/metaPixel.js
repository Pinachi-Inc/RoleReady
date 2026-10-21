// Meta (Facebook) Pixel. Loads only when VITE_META_PIXEL_ID is set, so local
// dev and preview builds without the variable send nothing to Meta. adConsent.js decides
// which visitors get it at all.
import { adPixelsAllowed } from './adConsent.js';

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID || '').trim();

// Meta's standard base code, minus the hardcoded ID and the <noscript> image
// (this is a JS app, so a no-JS visit never reaches it anyway).
export const initMetaPixel = () => {
  if (!PIXEL_ID || typeof window === 'undefined' || window.fbq || !adPixelsAllowed()) return;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', PIXEL_ID);
  window.fbq('track', 'PageView');
};

const track = (event, params) => {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  try {
    window.fbq('track', event, params);
  } catch (err) {
    console.warn('[pixel] %s failed: %s', event, err?.message || err);
  }
};

// Fire CompleteRegistration once, for an account that was just created.
// Callers pass Firebase's getAdditionalUserInfo(result).isNewUser, which is true
// only on the sign-in that created the account, so returning users never count.
export const trackSignUp = (isNewUser, method) => {
  if (!isNewUser) return;
  track('CompleteRegistration', method ? { content_name: method } : undefined);
};
