import { requireAuth } from './firebaseAuth.js';
import { getUserDoc, getEntitlement, listRuns, getRun } from './firestore.js';
import { renderCvMarkdown } from '../cvRenderer.js';

// Saved history is a paid feature. It is served from here rather than read by the browser
// straight from Firestore, so the plan check lives in one place and firestore.rules can deny
// the client the history collection outright.
//
// Free accounts still get a count back, so the UI can show a locked history area: someone who
// subscribed and then cancelled sees that their past runs are still there, waiting.

const LIST_LIMIT = 50;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/history            -> { locked, runs: [...] } or { locked: true, lockedCount }
 * POST /api/history { id }     -> { run: { id, createdAt, companyName, jobTitle, cv, cvContent, coverLetter } }
 */
export async function handleHistory(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.body || {};

  try {
    const stored = await getUserDoc(user.uid);
    if (stored === undefined) {
      console.error('[history] FIREBASE_SERVICE_ACCOUNT is not set; history is unavailable');
      return res.status(503).json({ error: 'History is not available right now.' });
    }
    const { plan } = getEntitlement(user, stored);
    const locked = plan === 'free';

    if (id !== undefined) {
      if (typeof id !== 'string' || !RUN_ID.test(id)) {
        return res.status(400).json({ error: 'Invalid run id' });
      }
      if (locked) {
        return res.status(402).json({ error: 'Saved history is part of RoleBerry Pro.', code: 'upgrade_required' });
      }
      const run = await getRun(user.uid, id);
      if (!run) return res.status(404).json({ error: 'That run no longer exists.' });
      return res.json({
        run: {
          id: run.id,
          createdAt: run.createdAt,
          companyName: run.companyName || '',
          jobTitle: run.jobTitle || '',
          profileName: run.profileName || null,
          cv: run.cv || null,
          // Re-rendered on read rather than stored, so old runs pick up renderer fixes.
          cvContent: run.cv ? renderCvMarkdown(run.cv) : '',
          coverLetter: run.coverLetter || '',
        },
      });
    }

    const runs = await listRuns(user.uid, LIST_LIMIT);
    if (locked) {
      // Only the count leaves the server: titles and companies are part of what is paid for.
      return res.json({ locked: true, lockedCount: runs.length, runs: [] });
    }
    return res.json({ locked: false, runs });
  } catch (err) {
    console.error('[history] failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not load your history.' });
  }
}
