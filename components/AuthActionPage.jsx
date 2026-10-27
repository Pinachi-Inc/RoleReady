import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import {
  waitForAuthReady,
  applyEmailVerification,
  checkPasswordResetCode,
  finishPasswordReset,
  friendlyAuthError,
} from '../services/auth.js';
import { authButtonClasses, ErrorBox } from './Auth.jsx';

// Where the links in our verification and reset emails land (/auth/action?mode=&oobCode=),
// in place of Firebase's default page. Verifying needs no click: it applies the code, says so
// for a moment and goes straight into the app. A reset asks for the new password, then signs in.

const REDIRECT_MS = 1200;
const inputClass = 'h-12 w-full rounded-xl border border-line bg-white px-4 pr-12 text-base text-ink placeholder:text-ink-faint transition focus:border-berry focus:outline-none focus:ring-4 focus:ring-berry/15';
const footerLink = 'text-[#FBEFF3]/70 hover:text-white';

const go = (path) => window.setTimeout(() => window.location.replace(path), REDIRECT_MS);

const Shell = ({ children }) => (
  <div className="font-brand min-h-screen flex flex-col bg-ink text-[#FBEFF3]">
    <header className="flex items-center px-5 sm:px-7 py-5">
      <a href="/"><img src="/roleberry-logo-dark.svg" alt="Roleberry home" className="h-8 w-auto" /></a>
    </header>
    <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-12">
      <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 sm:p-8 text-ink shadow-2xl shadow-black/30 text-center">
        {children}
      </div>
    </main>
    <footer className="flex justify-center gap-5 px-4 pb-6 text-[13px]">
      <a href="/terms" className={footerLink}>Terms</a>
      <a href="/privacy" className={footerLink}>Privacy</a>
      <a href="mailto:support@roleberry.app" className={footerLink}>support@roleberry.app</a>
    </footer>
  </div>
);

const Status = ({ icon, title, children }) => (
  <>
    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-berry-soft">{icon}</div>
    <h1 className="mb-2 text-2xl font-bold tracking-tight text-ink">{title}</h1>
    {children && <p className="text-ink-muted">{children}</p>}
  </>
);

const spinner = <Loader2 className="h-6 w-6 animate-spin text-berry" aria-hidden="true" />;
const tick = <CheckCircle2 className="h-6 w-6 text-leaf" aria-hidden="true" />;
const alert = <AlertCircle className="h-6 w-6 text-berry" aria-hidden="true" />;

const BackButton = ({ href, children }) => (
  <a href={href} className={`${authButtonClasses.primary} mt-6`}>{children}</a>
);

const VerifyEmailAction = ({ code }) => {
  const [state, setState] = useState('working'); // working | done | failed
  const [signedIn, setSignedIn] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; a code works only once.
    started.current = true;
    (async () => {
      await waitForAuthReady();
      try {
        const here = await applyEmailVerification(code);
        setSignedIn(here);
        setState('done');
        go(here ? '/' : '/login');
      } catch (error) {
        console.warn('[auth] verify link failed: %s', error?.code || error?.message);
        setState('failed');
      }
    })();
  }, [code]);

  if (state === 'working') return <Status icon={spinner} title="Verifying your email…" />;
  if (state === 'done') {
    return (
      <Status icon={tick} title="Email verified">
        {signedIn ? 'Taking you to Roleberry…' : 'Taking you to sign in…'}
      </Status>
    );
  }
  return (
    <>
      <Status icon={alert} title="This link has expired">
        It may have been used already. Open Roleberry and we&apos;ll send you a fresh one if you still need it.
      </Status>
      <BackButton href="/">Go to Roleberry</BackButton>
    </>
  );
};

const ResetPasswordAction = ({ code }) => {
  const [state, setState] = useState('checking'); // checking | form | saving | done | failed
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    checkPasswordResetCode(code)
      .then((address) => { if (live) { setEmail(address); setState('form'); } })
      .catch((err) => {
        console.warn('[auth] reset link failed: %s', err?.code || err?.message);
        if (live) setState('failed');
      });
    return () => { live = false; };
  }, [code]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setState('saving');
    try {
      const signedIn = await finishPasswordReset(code, email, password);
      setState('done');
      go(signedIn ? '/' : '/login');
    } catch (err) {
      const expired = err?.code === 'auth/expired-action-code' || err?.code === 'auth/invalid-action-code';
      if (expired) {
        setState('failed');
        return;
      }
      setError(friendlyAuthError(err) || 'Something went wrong. Please try again.');
      setState('form');
    }
  };

  if (state === 'checking') return <Status icon={spinner} title="Checking your link…" />;
  if (state === 'done') return <Status icon={tick} title="Password updated">Signing you in…</Status>;
  if (state === 'failed') {
    return (
      <>
        <Status icon={alert} title="This link has expired">
          Reset links work once and only for a short time. Ask for a new one from the sign-in page.
        </Status>
        <BackButton href="/login">Back to sign in</BackButton>
      </>
    );
  }

  const saving = state === 'saving';
  return (
    <form onSubmit={submit} className="text-left">
      <h1 className="mb-2 text-center text-2xl font-bold tracking-tight text-ink">Choose a new password</h1>
      <p className="mb-6 text-center text-ink-muted">
        For <span className="break-all font-semibold text-ink">{email}</span>
      </p>
      <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold text-ink">New password</label>
      <div className="relative">
        <input
          id="new-password"
          type={showPassword ? 'text' : 'password'}
          required
          minLength={6}
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          autoFocus
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-berry/20"
        >
          {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
      <button type="submit" disabled={saving} className={`${authButtonClasses.primary} mt-5`}>
        {saving ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Saving…</span>
          </>
        ) : (
          <span>Save and sign in</span>
        )}
      </button>
      {error && <ErrorBox>{error}</ErrorBox>}
    </form>
  );
};

const AuthActionPage = () => {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  const code = params.get('oobCode');

  let body;
  if (code && mode === 'verifyEmail') body = <VerifyEmailAction code={code} />;
  else if (code && mode === 'resetPassword') body = <ResetPasswordAction code={code} />;
  else {
    body = (
      <>
        <Status icon={alert} title="This link isn't valid">
          Check that you opened the whole link from the email.
        </Status>
        <BackButton href="/">Go to Roleberry</BackButton>
      </>
    );
  }
  return <Shell>{body}</Shell>;
};

export default AuthActionPage;
