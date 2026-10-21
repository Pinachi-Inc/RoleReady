// Sign-ups per source, from the first-touch data saved on each account at sign-up.
//
//   npm run signups                      all time
//   npm run signups -- --since 2026-10-27
//   npm run signups -- --since 2026-10-27 --by content    (or: campaign, method)
//
// Needs FIREBASE_SERVICE_ACCOUNT (read from .env). Accounts created before tracking existed
// have no source and are counted as "untracked".

import 'dotenv/config';
import { listSignupSources } from '../server/core/firestore.js';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const since = opt('since') ? new Date(opt('since')) : null;
const by = opt('by');
const detail = { content: 'utm_content', campaign: 'utm_campaign', method: 'method' }[by] || null;

if (since && Number.isNaN(since.getTime())) {
  console.error('--since needs a date like 2026-10-27');
  process.exit(2);
}

try {
  const rows = await listSignupSources();
  const counts = new Map();
  let untracked = 0;
  for (const r of rows) {
    if (!r.signedUpAt) {
      untracked += 1;
      continue;
    }
    if (since && new Date(r.signedUpAt) < since) continue;
    const key = detail ? `${r.source}  ${r[detail] || '-'}` : r.source;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((n, [, c]) => n + c, 0);
  console.log(`Sign-ups${since ? ` since ${since.toISOString().slice(0, 10)}` : ''}${detail ? ` by source and ${by}` : ' by source'}:`);
  for (const [key, c] of sorted) console.log(`  ${String(c).padStart(4)}  ${key}`);
  console.log(`  ${String(total).padStart(4)}  total tracked`);
  if (!since) console.log(`  ${String(untracked).padStart(4)}  untracked (made before tracking, or no source saved)`);
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
}
