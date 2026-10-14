// Complimentary Max for friends and testers, by email.
//
//   npm run comp -- grant friend@example.com
//   npm run comp -- revoke friend@example.com
//   npm run comp -- list
//
// Needs FIREBASE_SERVICE_ACCOUNT (read from .env), and STRIPE_SECRET_KEY for revoke to re-read
// a paying account's plan from Stripe. The person must have signed in once; for someone who
// has not, add them to COMP_MAX_EMAILS instead. See server/core/comp.js.

import 'dotenv/config';
import { grantComp, revokeComp, listComps } from '../server/core/comp.js';

const [command, email] = process.argv.slice(2);
const usage = 'Usage: npm run comp -- grant <email> | revoke <email> | list';

try {
  if (command === 'grant' && email) {
    const r = await grantComp(email);
    console.log(`Granted complimentary Max to ${r.email} (uid ${r.uid}).`);
  } else if (command === 'revoke' && email) {
    const r = await revokeComp(email);
    console.log(`Revoked complimentary Max from ${r.email} (uid ${r.uid}). Plan is now ${r.plan === 'paid' ? 'pro' : r.plan}.`);
    if (r.stillAllowlisted) console.log('Note: they are still in COMP_MAX_EMAILS, so they keep Max until removed from it.');
  } else if (command === 'list') {
    const { granted, allowlist } = await listComps();
    console.log(`Granted by script (${granted.length}):`);
    for (const g of granted) {
      console.log(`  ${g.email || '(email not recorded)'}  uid ${g.uid}  since ${g.since || '?'}  pays: ${g.stripePlan === 'paid' ? 'pro' : g.stripePlan}${g.legacy ? '  (old plan: unlimited marker)' : ''}`);
    }
    console.log(`COMP_MAX_EMAILS (${allowlist.length}): ${allowlist.join(', ') || '(none)'}`);
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
}
