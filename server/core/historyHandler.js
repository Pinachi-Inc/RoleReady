import { requireAuth } from './firebaseAuth.js';
import { getUserDoc, getEntitlement, listRuns, countRuns, getRun, MAX_HISTORY_VISIBLE } from './firestore.js';
import { renderCvMarkdown } from '../cvRenderer.js';

// Every account's runs are saved. What a plan can see of them is decided here rather than by
// the browser reading Firestore directly, so the check lives in one place and firestore.rules
// can deny the client the history collection outright.
//
// Free sees its newest runs in full (PLAN_LIMITS.free.historyVisible). Anything older stays
// stored and comes back as a locked stub carrying its date only, so the UI can show greyed
// rows and an unlock prompt. Upgrading unlocks them, since nothing was ever thrown away.

const LIST_LIMIT = 50;
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/history
 *   -> { runs: [...], visibleLimit, lockedCount, lockedRuns: [{ createdAt }] }
 *      visibleLimit is null when the plan sees everything; lockedCount counts every stored run
 *      beyond it, lockedRuns lists up to LIST_LIMIT of them.
 * POST /api/history { id }
 *   -> { run: { id, createdAt, companyName, jobTitle, cv, cvContent, coverLetter } }
 *      402 upgrade_required when the run exists but is beyond the plan's visible window.
 */
function unavailable(res) {
  console.error('[history] FIREBASE_SERVICE_ACCOUNT is not set; history is unavailable');
  return res.status(503).json({ error: 'History is not available right now.' });
}

export async function handleHistory(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.body || {};

  try {
    // Everything below is read in parallel: the plan is only known once the user document
    // arrives, so the reads that depend on it are sized for the most any plan could need.
    if (id !== undefined) {
      if (typeof id !== 'string' || !RUN_ID.test(id)) {
        return res.status(400).json({ error: 'Invalid run id' });
      }
      const [stored, run, newest] = await Promise.all([
        getUserDoc(user.uid),
        getRun(user.uid, id),
        MAX_HISTORY_VISIBLE > 0 ? listRuns(user.uid, MAX_HISTORY_VISIBLE) : null,
      ]);
      if (stored === undefined) return unavailable(res);
      const { historyVisible } = getEntitlement(user, stored);
      if (!run) return res.status(404).json({ error: 'That run no longer exists.' });
      if (historyVisible != null) {
        const visible = (newest || []).slice(0, historyVisible);
        if (!visible.some((r) => r.id === id)) {
          return res.status(402).json({ error: 'Older runs are part of RoleBerry Pro.', code: 'upgrade_required' });
        }
      }
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

    const [stored, recent, total] = await Promise.all([
      getUserDoc(user.uid),
      listRuns(user.uid, MAX_HISTORY_VISIBLE + LIST_LIMIT),
      countRuns(user.uid),
    ]);
    if (stored === undefined) return unavailable(res);
    const { historyVisible } = getEntitlement(user, stored);

    if (historyVisible == null) {
      return res.json({ runs: recent.slice(0, LIST_LIMIT), visibleLimit: null, lockedCount: 0, lockedRuns: [] });
    }

    const runs = recent.slice(0, historyVisible);
    // Only the date of a locked run leaves the server: titles, companies and documents are
    // part of what is paid for.
    const lockedRuns = recent.slice(historyVisible, historyVisible + LIST_LIMIT).map((r) => ({ createdAt: r.createdAt }));
    return res.json({
      runs,
      visibleLimit: historyVisible,
      lockedCount: Math.max(0, total - runs.length),
      lockedRuns,
    });
  } catch (err) {
    console.error('[history] failed for uid=%s: %s', user.uid, err?.message || err);
    return res.status(500).json({ error: 'Could not load your history.' });
  }
}
