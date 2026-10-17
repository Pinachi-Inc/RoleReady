import React, { useState } from 'react';
import { MailCheck, Loader2 } from 'lucide-react';
import { resendVerification, refreshEmailVerified, signOutUser, friendlyAuthError } from '../services/auth.js';
import { authButtonClasses, ErrorBox, NoticeBox } from './Auth.jsx';

// Shown instead of the app to a password account whose email is not verified yet.
const VerifyEmail = ({ user, onVerified, onSignedOut }) => {
  const [busy, setBusy] = useState(null); // 'resend' | 'check' | 'signout'
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (kind, fn) => {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (err) {
      console.warn('[auth] verification step failed: %s', err?.code || err?.message);
      setError(friendlyAuthError(err) || 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleResend = () => run('resend', async () => {
    await resendVerification();
    setNotice(`Sent a new link to ${user.email}.`);
  });

  const handleCheck = () => run('check', async () => {
    const verified = await refreshEmailVerified();
    if (verified) onVerified();
    else setError('Not verified yet. Click the link in the email, then try again.');
  });

  const handleSignOut = () => run('signout', async () => {
    await signOutUser();
    onSignedOut();
  });

  return (
    <div className="text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-berry-soft">
        <MailCheck className="h-6 w-6 text-berry" aria-hidden="true" />
      </div>
      <h2 className="mb-2 text-2xl font-bold tracking-tight text-ink">Check your inbox</h2>
      <p className="mb-6 text-ink-muted">
        We sent a verification link to <span className="break-all font-semibold text-ink">{user.email}</span>.
        Click it to finish setting up your account.
      </p>
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleCheck}
          disabled={!!busy}
          className={authButtonClasses.primary}
        >
          {busy === 'check' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>Checking…</span>
            </>
          ) : (
            <span>I've verified</span>
          )}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={!!busy}
          className={authButtonClasses.secondary}
        >
          {busy === 'resend' ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={!!busy}
          className="rounded text-sm font-semibold text-ink-muted hover:text-ink hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-berry/20"
        >
          Sign out
        </button>
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {notice && <NoticeBox>{notice}</NoticeBox>}
    </div>
  );
};

export default VerifyEmail;
