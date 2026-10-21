import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';

// In-app replacement for window.alert / confirm / prompt, in the Roleberry style.
//
//   const dialog = useDialog();
//   await dialog.alert({ title, message });
//   if (await dialog.confirm({ title, message, confirmLabel, danger: true })) ...
//   const name = await dialog.prompt({ title, label, defaultValue, validate });  // null on cancel
//
// One dialog shows at a time; a second call waits for the first to close.
// Phones get a bottom sheet, wider screens a centred card. Enter confirms, Escape cancels.

const DialogContext = createContext(null);

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
};

const primaryButton = 'inline-flex items-center justify-center rounded-lg px-4 h-11 sm:h-10 text-sm font-semibold text-white disabled:opacity-50 focus:outline-none focus-visible:ring-4';
const secondaryButton = 'inline-flex items-center justify-center rounded-lg border border-line px-4 h-11 sm:h-10 text-sm font-semibold text-ink hover:bg-hover dark:border-night-line dark:text-night-text dark:hover:bg-night-raised focus:outline-none focus-visible:ring-4 focus-visible:ring-berry/15';

const DialogView = ({ request, onClose }) => {
  const { kind, title, message, label, placeholder, confirmLabel, cancelLabel, danger, maxLength = 80, validate } = request;
  const [value, setValue] = useState(request.defaultValue || '');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const cardRef = useRef(null);
  const titleId = useId();
  const messageId = useId();
  const errorId = useId();

  const trimmed = value.trim();
  const error = kind === 'prompt'
    ? (!trimmed ? `${label || 'This field'} can't be empty.` : (validate ? validate(trimmed) : null))
    : null;

  const cancel = useCallback(() => onClose(kind === 'prompt' ? null : false), [kind, onClose]);
  const submit = () => {
    if (kind === 'prompt') {
      setTouched(true);
      if (error) { inputRef.current?.focus(); return; }
      onClose(trimmed);
    } else {
      onClose(true);
    }
  };

  // Focus the field (or the main button), lock page scroll, and give focus back on close.
  useEffect(() => {
    const previous = document.activeElement;
    const target = kind === 'prompt' ? inputRef.current : confirmRef.current;
    target?.focus();
    if (kind === 'prompt') inputRef.current?.select();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [kind]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      cancel();
    } else if (event.key === 'Tab') {
      // Keep keyboard focus inside the dialog.
      const items = cardRef.current?.querySelectorAll('button, input');
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };

  const showError = touched && error;
  const tone = danger
    ? 'bg-danger-text hover:bg-[#912018] focus-visible:ring-danger-text/20'
    : 'bg-berry hover:bg-berry-dark focus-visible:ring-berry/20';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/50 sm:p-4 print:hidden"
      onMouseDown={(event) => { if (event.target === event.currentTarget) cancel(); }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={cardRef}
        role={kind === 'prompt' ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="font-brand w-full sm:max-w-md bg-white dark:bg-night-surface text-ink dark:text-night-text rounded-t-2xl sm:rounded-2xl shadow-[0_24px_60px_rgba(36,19,28,0.28)] border border-line dark:border-night-line pb-[env(safe-area-inset-bottom)]"
      >
        <form
          noValidate
          onSubmit={(event) => { event.preventDefault(); submit(); }}
          className="p-5 sm:p-6"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line dark:bg-night-line sm:hidden" aria-hidden="true"></div>
          <div className="flex items-start gap-3">
            {kind !== 'prompt' && (
              <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-danger-bg text-danger-text' : 'bg-berry-soft text-berry'}`}>
                {danger ? <Trash2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-extrabold leading-snug">{title}</h2>
              {message && (
                <p id={messageId} className="mt-1 text-sm text-ink-muted dark:text-night-muted break-words">{message}</p>
              )}
            </div>
          </div>

          {kind === 'prompt' && (
            <div className="mt-4">
              {label && <label htmlFor={`${titleId}-input`} className="block text-sm font-semibold">{label}</label>}
              <input
                id={`${titleId}-input`}
                ref={inputRef}
                type="text"
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={showError ? 'true' : 'false'}
                aria-describedby={showError ? errorId : undefined}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => { if (value) setTouched(true); }}
                className={`mt-1.5 w-full h-11 rounded-lg border bg-white dark:bg-night-raised px-3 text-base sm:text-sm text-ink dark:text-night-text placeholder:text-ink-faint focus:outline-none focus:ring-4 ${showError ? 'border-danger-text focus:ring-danger-text/15' : 'border-line dark:border-night-line focus:border-berry focus:ring-berry/15'}`}
              />
              <div className="mt-1.5 flex items-start justify-between gap-3 text-xs">
                <span id={errorId} className="text-danger-text" role={showError ? 'alert' : undefined}>{showError ? error : ''}</span>
                {value.length > maxLength - 20 && (
                  <span className="shrink-0 text-ink-faint">{value.length} / {maxLength}</span>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {kind !== 'alert' && (
              <button type="button" onClick={cancel} className={secondaryButton}>
                {cancelLabel || 'Cancel'}
              </button>
            )}
            <button
              ref={confirmRef}
              type="submit"
              disabled={kind === 'prompt' && touched && Boolean(error)}
              className={`${primaryButton} ${tone}`}
            >
              {confirmLabel || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'Confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const DialogProvider = ({ children }) => {
  const [queue, setQueue] = useState([]);

  const open = useCallback((kind, options) => new Promise((resolve) => {
    const opts = typeof options === 'string' ? { message: options } : (options || {});
    setQueue((q) => [...q, { ...opts, kind, resolve, id: Math.random() }]);
  }), []);

  const api = useRef(null);
  if (!api.current) {
    api.current = {
      alert: (o) => open('alert', o),
      confirm: (o) => open('confirm', o),
      prompt: (o) => open('prompt', o),
    };
  }

  const current = queue[0];
  const close = useCallback((result) => {
    current?.resolve(result);
    setQueue((q) => q.slice(1));
  }, [current]);

  return (
    <DialogContext.Provider value={api.current}>
      {children}
      {current && <DialogView key={current.id} request={{ title: current.kind === 'alert' ? 'Something went wrong' : 'Are you sure?', ...current }} onClose={close} />}
    </DialogContext.Provider>
  );
};
