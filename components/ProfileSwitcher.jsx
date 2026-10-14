import React, { useState } from 'react';
import { Users, Lock, Check, Pencil, Trash2, Plus } from 'lucide-react';

// Toolbar dropdown for saved profiles (paid). Free accounts see the same button with a lock;
// clicking it opens the paywall instead of the menu.
//
// Profiles are snapshots of the working profile; see services/profiles.js.
const ProfileSwitcher = ({ locked, profiles, activeProfileId, limit, busy, onLocked, onSwitch, onSaveAs, onRename, onDelete }) => {
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
        className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 flex items-center gap-1 disabled:opacity-50"
        title={locked ? 'Saved profiles are part of RoleBerry Pro' : 'Switch profile'}
      >
        {locked ? <Lock className="h-3 w-3" /> : <Users className="h-3 w-3" />}
        <span className="max-w-[10rem] truncate">{active ? active.name : 'Profiles'}</span>
      </button>

      {open && !locked && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)}></div>
          <div className="absolute right-0 top-10 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-2 w-72 text-gray-800">
            <div className="px-4 pb-2 text-xs text-gray-500 border-b border-gray-100">
              Saved profiles{limit != null ? ` (${entries.length} of ${limit})` : ''}
            </div>
            {entries.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">
                Save your current info as a profile to keep separate versions, e.g. one per role you apply for.
              </div>
            )}
            {entries.map(([id, p]) => (
              <div key={id} className="px-2 py-1 flex items-center gap-1 hover:bg-gray-50">
                <button
                  type="button"
                  onClick={() => { setOpen(false); onSwitch(id); }}
                  className="flex-1 min-w-0 text-left px-2 py-1 text-sm flex items-center gap-2"
                  title="Switch to this profile"
                >
                  <Check className={`h-4 w-4 shrink-0 ${id === activeProfileId ? 'text-blue-600' : 'text-transparent'}`} />
                  <span className="truncate">{p.name || 'Untitled'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { const name = askName(p.name); if (name) onRename(id, name); }}
                  className="p-1 text-gray-400 hover:text-gray-700"
                  aria-label={`Rename ${p.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { if (window.confirm(`Delete the profile "${p.name}"? Your current info is kept.`)) onDelete(id); }}
                  className="p-1 text-gray-400 hover:text-red-600"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                type="button"
                disabled={atCap}
                onClick={() => { const name = askName(); if (name) { setOpen(false); onSaveAs(name); } }}
                className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2 disabled:text-gray-400 disabled:hover:bg-transparent"
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
