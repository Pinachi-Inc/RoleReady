// Every business detail the Privacy Policy and Terms depend on, in one place. Values wrapped in
// [square brackets] are placeholders. While any remain, the legal pages show a "draft" notice,
// so an unfinished policy can never pass for a final one.
//
// Plan facts (prices, limits) are written into the Terms text itself, next to the rules they
// belong to. Keep them in step with PLAN_LIMITS in server/core/firestore.js and
// components/PricingModal.jsx.

export const LEGAL = {
  product: 'RoleBerry',
  site: 'https://roleberry.app',
  // The legal entity that runs RoleBerry and is the data controller, e.g. "Pinachi Inc."
  company: '[COMPANY LEGAL NAME]',
  // Registered address, needed for GDPR and for consumer law in most places.
  address: '[REGISTERED ADDRESS]',
  // One inbox for privacy requests, support and legal notices.
  email: '[CONTACT EMAIL]',
  // Courts and law that govern the Terms, e.g. "the State of Delaware, USA".
  governingLaw: '[GOVERNING LAW AND COURTS]',
  // Last time either document changed in substance.
  effectiveDate: '[EFFECTIVE DATE]',
  // How long after an account deletion request everything is gone, backups included.
  deletionDays: 30,
  // Minimum age to use RoleBerry.
  minimumAge: 16,
};

export const isDraft = () => Object.values(LEGAL).some((v) => typeof v === 'string' && /^\[.*\]$/.test(v));
