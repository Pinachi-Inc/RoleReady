// Every business detail the Privacy Policy and Terms depend on, in one place. Values wrapped in
// [square brackets] are placeholders. While any remain, the legal pages show a "draft" notice,
// so an unfinished policy can never pass for a final one.
//
// Plan facts (prices, limits) are written into the Terms text itself, next to the rules they
// belong to. Keep them in step with PLAN_LIMITS in server/core/firestore.js and
// components/PricingModal.jsx.

export const LEGAL = {
  product: 'Roleberry',
  site: 'https://roleberry.app',
  // The name the operator is shown under on the legal pages. Contact is by email only.
  seller: 'Roleberry',
  // One inbox for privacy requests, support and legal notices.
  email: 'support@roleberry.app',
  // The law that governs the Terms, and the courts that hear disputes.
  governingLaw: 'the Republic of Armenia',
  courts: 'the courts of Yerevan, Armenia',
  // Last time either document changed in substance.
  effectiveDate: '26 October 2026',
  // How long after an account deletion request everything is gone, backups included.
  deletionDays: 30,
  // Minimum age to use Roleberry.
  minimumAge: 16,
  // Who sells the subscription as merchant of record. Lemon Squeezy declined Roleberry in
  // October 2026; put the new provider's name here (for example 'Polar') once one approves.
  merchant: 'our payment provider',
};

// LEGAL.merchant with a capital first letter, for the start of a sentence or table cell.
export const Merchant = () => LEGAL.merchant.charAt(0).toUpperCase() + LEGAL.merchant.slice(1);

export const isDraft = () => Object.values(LEGAL).some((v) => typeof v === 'string' && /^\[.*\]$/.test(v));
