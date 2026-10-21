// Whether the ad pixels (Meta, Reddit) may load for this visitor.
//
// They stay off when the browser sends Global Privacy Control, which California and a few other
// US states treat as an opt-out of sharing for ads, and for visitors whose browser is set to a
// European time zone, since the EU and UK need consent before such cookies are set and our ads
// do not target Europe anyway. The time zone is only a rough stand-in for location, and it errs
// towards sending nothing.
export const adPixelsAllowed = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (window.navigator?.globalPrivacyControl === true) return false;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (/^(Europe|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe))\//.test(zone)) return false;
  } catch {
    return false;
  }
  return true;
};
