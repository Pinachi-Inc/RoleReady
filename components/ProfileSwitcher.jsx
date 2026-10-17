import React, { useState } from 'react';
import { Users, Lock, Check, Pencil, Trash2, Plus, ChevronDown } from 'lucide-react';

// Toolbar dropdown for saved profiles. Free keeps one and sees a locked second slot that opens
// the paywall (`upsell`); paid keeps up to `limit`. `locked` is for while the plan is unknown:
// the button opens the paywall instead of the menu.
//
// Profiles are snapshots of the working profile; see services/profiles.js.
const ProfileSwitcher = ({ locked, upsell, profiles, activeProfileId, limit, busy, onLocked, onSwitch, onSaveAs, onRename, onDelete, tone = 'light' }) => {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(profiles || {}).sort(([, a], [, b]) => String(a.name || '').localeCompare(String(b.name || '')));
  const active = activeProfileId && profiles?.[activeProfileId];
  const atCap = limit != null && entries.length >= limit;

  const askName = (current = '') => {
    const name = window.prompt('Profile name', current);
    const trimmed = String(name || '').trim().slice(0, 80);
    return trimmed || null;
  };

  const handleButton = () => {
    if (locked) {
      onLocked();
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleButton}
        disabled={busy}
        className={tone === 'dark'
          ? 'inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-white/15 bg-white/5 text-[13.5px] font-semibold text-[#FBEFF3] hover:bg-white/10 disabled:opacity-50'
          : 'px-3 py-1.5 rounded-lg text-sm font-medium border border-line text-ink hover:bg-hover dark:border-night-line dark:text-night-text dark:hover:bg-night-surface flex items-center gap-1 disabled:opacity-50'}
        title={locked ? 'Saved profiles are part of Roleberry Pro' : 'Switch profile'}
      >
        {locked ? <Lock className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        <span className="max-w-[7rem] sm:max-w-[10rem] truncate">{active ? active.name : 'Profiles'}</span>
        {tone === 'dark' && <ChevronDown className="hidden sm:block h-4 w-4 opacity-60" />}
      </button>

      {open && !locked && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 top-11 z-20 bg-white rounded-xl shadow-xl border border-line py-2 w-72 text-ink">
            <div className="px-4 pb-2 text-xs text-ink-muted border-b border-line">
              Saved profiles{limit != null ? ` (${entries.length} of ${limit})` : ''}
            </div>
            {entries.length === 0 && (
              <div className="px-4 py-3 text-sm text-ink-muted">
                Save your current info as a profile to keep separate versions, e.g. one per role you apply for.
              </div>
            )}
            {entries.map(([id, p]) => (
              <div key={id} className="px-2 py-1 flex items-center gap-1 hover:bg-hover">
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSwitch(id); }}
                  className="flex-1 min-w-0 text-left px-2 py-1 text-sm flex items-center gap-2"
                  title="Switch to this profile"
                >
                  <Check className={`h-4 w-4 shrink-0 ${id === activeProfileId ? 'text-berry' : 'text-transparent'}`} />
                  <span className="truncate">{p.name || 'Untitled'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { const name = askName(p.name); if (name) onRename(id, name); }}
                  className="p-1 text-ink-faint hover:text-ink"
                  aria-label={`Rename ${p.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { if (window.confirm(`Delete the profile "${p.name}"? Your current info is kept.`)) onDelete(id); }}
                  className="p-1 text-ink-faint hover:text-danger-text"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {upsell && (
              <button
                type="button"
                onClick={() => { setOpen(false); onLocked(); }}
                className="w-full px-4 py-2 flex items-center gap-2 text-left text-sm text-ink-faint hover:bg-warn-bg"
                title="More saved profiles are part of Roleberry Pro"
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">Second profile</span>
                <span className="text-xs font-medium text-warn-text">Pro</span>
              </button>
            )}
            <div className={`border-t border-line mt-1 pt-1 ${upsell && atCap ? 'hidden' : ''}`}>
              <button
                type="button"
                disabled={atCap}
                onClick={() => { const name = askName(); if (name) { setOpen(false); onSaveAs(name); } }}
                className="w-full text-left px-4 py-2 text-sm text-berry hover:bg-berry-soft flex items-center gap-2 disabled:text-ink-faint disabled:hover:bg-transparent"
                title={atCap ? `You can keep up to ${limit} profiles. Delete one to save another.` : ''}
              >
                <Plus className="h-4 w-4" />
                Save current info as a new profile
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProfileSwitcher;
