import React, { useEffect, useState } from 'react';
import { ArrowLeft, Clock, Download, FileText, Lock, Sparkles } from 'lucide-react';
import { listHistory, getHistoryRun } from '../services/history.js';
import { buildCvPdf, buildCoverLetterPdf } from '../src/cvPdf.js';

// Past runs, newest first. Every plan's runs are saved; free can open its newest few
// (visibleLimit) and sees the rest as greyed, blurred rows with an unlock prompt. The server
// sends only the date of a locked run, so the row text is placeholder.

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const filePart = (s) => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const PLACEHOLDER_TITLES = ['Senior Platform Engineer', 'DevOps Engineer', 'Site Reliability Engineer'];
const MAX_LOCKED_ROWS = 3;

const HistoryPage = ({ onBack, onOpenRun, onUpgrade }) => {
  const [state, setState] = useState({ loading: true, error: '', visibleLimit: null, lockedCount: 0, lockedRuns: [], runs: [] });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listHistory()
      .then((data) => {
        if (!cancelled) setState({
          loading: false,
          error: '',
          visibleLimit: data.visibleLimit ?? null,
          lockedCount: data.lockedCount || 0,
          lockedRuns: data.lockedRuns || [],
          runs: data.runs || [],
        });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message || 'Could not load your history.' }));
      });
    return () => { cancelled = true; };
  }, []);

  // Fetches the full run on demand: the list carries metadata only.
  const withRun = async (id, fn) => {
    setBusyId(id);
    try {
      fn(await getHistoryRun(id));
    } catch (err) {
      if (err.code === 'upgrade_required') onUpgrade();
      else alert(err.message || 'Could not load that run.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadCv = (id) => withRun(id, (run) => {
    if (!run.cv) return alert('This run has no CV to download.');
    const base = [filePart(run.cv.name) || 'RoleBerry_CV', filePart(run.companyName)].filter(Boolean).join('_');
    buildCvPdf(run.cv).save(`${base}.pdf`);
  });

  const downloadLetter = (id) => withRun(id, (run) => {
    if (!run.coverLetter) return alert('This run has no cover letter.');
    const base = [filePart(run.cv?.name) || 'RoleBerry', filePart(run.companyName)].filter(Boolean).join('_');
    buildCoverLetterPdf(run.coverLetter, run.cv).save(`${base}_Cover_Letter.pdf`);
  });

  const open = (id) => withRun(id, onOpenRun);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Clock className="h-6 w-6" />History</h2>
      </div>

      {state.loading && <p className="text-sm text-gray-500">Loading your history…</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      {!state.loading && !state.error && state.runs.length === 0 && (
        <p className="text-sm text-gray-500">Nothing here yet. Every CV you optimize will be saved here.</p>
      )}

      {!state.loading && !state.error && state.runs.length > 0 && (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
          {state.runs.map((run) => (
            <li key={run.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{run.jobTitle || 'Untitled role'}</div>
                <div className="text-sm text-gray-500 truncate">
                  {[run.companyName, formatDate(run.createdAt), run.profileName && `profile: ${run.profileName}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === run.id}
                  onClick={() => open(run.id)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 disabled:opacity-50"
                >
                  <FileText className="h-3 w-3" />
                  Open
                </button>
                <button
                  type="button"
                  disabled={busyId === run.id}
                  onClick={() => downloadCv(run.id)}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
                >
                  <Download className="h-3 w-3" />
                  CV
                </button>
                {run.hasCoverLetter && (
                  <button
                    type="button"
                    disabled={busyId === run.id}
                    onClick={() => downloadLetter(run.id)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Download className="h-3 w-3" />
                    Letter
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!state.loading && !state.error && state.visibleLimit != null && state.runs.length > 0 && state.lockedCount === 0 && (
        <p className="text-xs text-gray-500">
          Free shows your last {state.visibleLimit} runs. Older ones stay saved and unlock with RoleBerry Pro.
        </p>
      )}

      {!state.loading && !state.error && state.lockedCount > 0 && (
        <div className="relative min-h-[13rem] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700 blur-sm grayscale select-none pointer-events-none" aria-hidden="true">
            {Array.from({ length: Math.min(state.lockedCount, MAX_LOCKED_ROWS) }, (_, i) => (
              <li key={i} className="p-4 flex items-center justify-between opacity-50">
                <div>
                  <div className="font-medium">{PLACEHOLDER_TITLES[i % PLACEHOLDER_TITLES.length]}</div>
                  <div className="text-sm text-gray-500">{formatDate(state.lockedRuns[i]?.createdAt) || 'Saved run'}</div>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1.5 rounded-md text-sm bg-gray-200 dark:bg-gray-700">Open</span>
                  <span className="px-3 py-1.5 rounded-md text-sm bg-gray-200 dark:bg-gray-700">CV</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-white/60 dark:bg-gray-900/60">
            <Lock className="h-6 w-6 text-gray-600 dark:text-gray-300 mb-2" />
            <p className="font-medium">
              {state.lockedCount} older run{state.lockedCount === 1 ? ' is' : 's are'} saved.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Free shows your last {state.visibleLimit} runs. RoleBerry Pro opens your full history.
            </p>
            <button
              type="button"
              onClick={onUpgrade}
              className="px-4 py-2 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 flex items-center gap-1"
            >
              <Sparkles className="h-4 w-4" />
              Unlock history
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
