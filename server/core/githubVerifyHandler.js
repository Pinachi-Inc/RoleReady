import axios from 'axios';
import { requireAuth } from './firebaseAuth.js';
import { getAuthUser, markEmailVerified } from './firestore.js';

const GITHUB_API = 'https://api.github.com';

// Firebase marks every GitHub email unverified, because it does not trust GitHub's own check.
// That kept GitHub users' emails out of comps and Checkout, and let a later Google sign-in drop
// GitHub from the account. GitHub does know whether the address is verified, so after a GitHub
// sign-in the client sends us the GitHub access token and we ask GitHub directly.
//
// Body: { accessToken }. Answers { verified: boolean }.
export async function handleGithubVerify(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
  if (!accessToken) {
    res.status(400).json({ error: 'Missing GitHub access token' });
    return;
  }

  try {
    const record = await getAuthUser(user.uid);
    if (!record?.email) {
      res.status(200).json({ verified: false });
      return;
    }
    if (record.emailVerified) {
      res.status(200).json({ verified: true });
      return;
    }

    const linked = (record.providerData || []).find((p) => p.providerId === 'github.com');
    if (!linked) {
      res.status(400).json({ error: 'No GitHub account is linked to this sign-in' });
      return;
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const [profile, emails] = await Promise.all([
      axios.get(`${GITHUB_API}/user`, { headers }),
      axios.get(`${GITHUB_API}/user/emails`, { headers }),
    ]);

    // The token must belong to the GitHub account linked to this Firebase user, not just any
    // GitHub account that happens to list the address.
    if (String(profile.data?.id) !== String(linked.uid)) {
      console.warn('[github-verify] token belongs to a different GitHub account for uid=%s', user.uid);
      res.status(403).json({ error: 'That GitHub token is for a different account' });
      return;
    }

    const wanted = record.email.toLowerCase();
    const match = (Array.isArray(emails.data) ? emails.data : [])
      .find((e) => String(e?.email || '').toLowerCase() === wanted && e.verified === true);
    if (!match) {
      res.status(200).json({ verified: false });
      return;
    }

    await markEmailVerified(user.uid);
    console.log('[github-verify] email verified through GitHub for uid=%s', user.uid);
    res.status(200).json({ verified: true });
  } catch (err) {
    const status = err?.response?.status;
    console.warn('[github-verify] failed for uid=%s: %s', user.uid, status || err?.message || err);
    if (status === 401) {
      res.status(401).json({ error: 'GitHub rejected the access token' });
      return;
    }
    res.status(502).json({ error: 'Could not check the email with GitHub' });
  }
}
