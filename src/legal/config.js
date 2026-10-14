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
  // RoleBerry is sold by one person trading on their own account (a sole trader), not by a
  // company. That person is the seller and the data controller.
  seller: '[FULL LEGAL NAME]',
  // Where the seller can be reached by post. GDPR and most consumer law require one.
  address: '[CITY AND ADDRESS]',
  // One inbox for privacy requests, support and legal notices.
  email: 'support@roleberry.app',
  // The law that governs the Terms, and the courts that hear disputes.
  governingLaw: 'the Republic of Armenia',
  courts: 'the courts of Yerevan, Armenia',
  // Last time either document changed in substance.
  effectiveDate: '[EFFECTIVE DATE]',
  // How long after an account deletion request everything is gone, backups included.
  deletionDays: 30,
  // Minimum age to use RoleBerry.
  minimumAge: 16,
};

export const isDraft = () => Object.values(LEGAL).some((v) => typeof v === 'string' && /^\[.*\]$/.test(v));
