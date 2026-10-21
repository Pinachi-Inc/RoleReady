import React, { useState, useEffect } from 'react';
import { LayoutTemplate, ChevronDown, Lock, Check } from 'lucide-react';
import { TEMPLATES, templateById } from '../src/documents/catalog.js';

// value is the effective style id (what is actually drawn), not the saved choice.
const TemplatePicker = ({ value, extraTemplates, onChange, onLocked, disabled }) => {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pick = (t, locked, selected) => {
    close();
    if (locked) onLocked();
    else if (!selected) onChange(t.id);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose a CV template"
        className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[9px] border text-[13px] font-semibold border-line bg-white text-ink hover:bg-blush dark:bg-night-raised dark:border-night-line dark:text-night-text dark:hover:bg-night-surface disabled:opacity-50"
      >
        <LayoutTemplate className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Template:</span>
        {templateById(value).name}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div
            role="dialog"
            aria-label="CV templates"
            className="absolute right-0 top-10 z-20 w-[min(92vw,540px)] rounded-xl border border-line bg-white p-3 shadow-xl text-ink dark:bg-night-surface dark:border-night-line dark:text-night-text"
          >
            <p className="text-xs text-ink-muted dark:text-night-muted">CV template, used for your CV and cover letter</p>
            <div className="mt-2 grid grid-cols-3 gap-2.5">
              {TEMPLATES.map((t) => {
                const locked = t.extra && !extraTemplates;
                const selected = t.id === value;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={locked ? `${t.name} (Max plan)` : t.name}
                    onClick={() => pick(t, locked, selected)}
                    className={`relative flex flex-col rounded-lg border p-1.5 text-left hover:bg-hover dark:hover:bg-night-raised ${selected ? 'border-berry ring-2 ring-berry/30' : 'border-line dark:border-night-line'}`}
                  >
                    <img
                      src={t.thumb}
                      alt=""
                      loading="lazy"
                      className={`w-full aspect-[210/297] rounded border border-line object-cover object-top bg-white ${locked ? 'opacity-60' : ''}`}
                    />
                    {selected && (
                      <span className="absolute top-2.5 right-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-berry text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    {locked && (
                      <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-ink/85 px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                        <Lock className="h-3 w-3" />Max
                      </span>
                    )}
                    <span className="mt-1.5 text-[13px] font-bold">{t.name}</span>
                    <span className="hidden sm:block text-[11.5px] leading-snug text-ink-muted dark:text-night-muted">{t.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[11.5px] text-ink-muted dark:text-night-muted">
              Every template is single-column and ATS-friendly.
              {!extraTemplates && (
                <>
                  {' Modern and Executive come with '}
                  <button type="button" onClick={() => { close(); onLocked(); }} className="font-semibold text-berry underline">Max</button>
                  .
                </>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default TemplatePicker;
