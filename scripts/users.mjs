// Account admin: list accounts, delete one, or wipe test accounts before launch.
//
//   npm run users -- list
//   npm run users -- delete <email|uid>            shows what would be deleted
//   npm run users -- delete <email|uid> --yes      deletes it
//   npm run users -- wipe --keep a@x.com,b@y.com    lists every account NOT in --keep
//   npm run users -- wipe --keep a@x.com,b@y.com --yes   deletes them
//
// Deleting cancels the Lemon Squeezy subscription, removes users/{uid} with its history, the
// account's feedback reports, and the Firebase Auth account. It cannot be undone, so nothing
// is deleted without --yes. Needs FIREBASE_SERVICE_ACCOUNT, and LEMONSQUEEZY_API_KEY to cancel
// subscriptions (read from .env). See server/core/accounts.js.

import 'dotenv/config';
import { listAccounts, resolveAccount, deleteAccount } from '../server/core/accounts.js';

const args = process.argv.slice(2);
const [command, target] = args;
const confirmed = args.includes('--yes');
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const usage = 'Usage: npm run users -- list | delete <email|uid> [--yes] | wipe --keep <emails> [--yes]';

const line = (a) => [
  (a.email || '(no email)').padEnd(36),
  a.uid.padEnd(30),
  `plan ${a.plan === 'paid' ? 'pro' : a.plan}${a.comped ? ' (comped)' : ''}`.padEnd(20),
  `created ${a.createdAt?.slice(0, 10) || '?'}`,
  a.subscriptionId ? `  sub ${a.subscriptionId} ${a.subscriptionStatus || ''}` : '',
].join('  ');

async function remove(accounts) {
  for (const a of accounts) {
    const r = await deleteAccount(a.uid);
    console.log(`Deleted ${a.email || a.uid}: auth ${r.auth}, subscription ${r.subscription}, ${r.feedbackReports} feedback report(s).`);
  }
}

try {
  if (command === 'list') {
    const accounts = await listAccounts();
    for (const a of accounts) console.log(line(a));
    console.log(`${accounts.length} account(s).`);
  } else if (command === 'delete' && target && target !== '--yes') {
    const record = await resolveAccount(target);
    if (!record) throw new Error(`No account for ${target}.`);
    const account = (await listAccounts()).find((a) => a.uid === record.uid);
    console.log(line(account));
    if (!confirmed) console.log('Not deleted. Run again with --yes to delete this account and everything stored about it.');
    else await remove([account]);
  } else if (command === 'wipe') {
    const keepRaw = opt('keep');
    if (!keepRaw) throw new Error('wipe needs --keep <emails>, the accounts to leave alone (e.g. your own).');
    const keep = new Set(keepRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
    const accounts = await listAccounts();
    const doomed = accounts.filter((a) => !keep.has(String(a.email || '').toLowerCase()));
    const kept = accounts.length - doomed.length;
    for (const a of doomed) console.log(line(a));
    console.log(`${doomed.length} account(s) to delete, ${kept} kept.`);
    if (!confirmed) console.log('Nothing deleted. Run again with --yes to delete the accounts listed above.');
    else await remove(doomed);
  } else {
    console.error(usage);
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err?.message || err);
  process.exitCode = 1;
}
