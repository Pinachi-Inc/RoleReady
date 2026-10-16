import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { resendVerification, refreshEmailVerified, signOutUser, friendlyAuthError } from '../services/auth.js';

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
      <MailCheck className="h-10 w-10 text-blue-400 mx-auto mb-4" />
      <h2 className="text-2xl font-semibold text-white mb-2">Check your inbox</h2>
      <p className="text-gray-400 mb-6">
        We sent a verification link to <span className="text-gray-200 break-all">{user.email}</span>.
        Click it to finish setting up your account.
      </p>
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleCheck}
          disabled={!!busy}
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy === 'check' ? 'Checking…' : "I've verified"}
        </button>
        <button
          type="button"
          onClick={handleResend}
          disabled={!!busy}
          className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {busy === 'resend' ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={!!busy}
          className="text-sm text-gray-400 hover:text-gray-200 underline disabled:opacity-60"
        >
          Sign out
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-red-400" role="alert">{error}</p>}
      {notice && <p className="mt-4 text-sm text-green-400" role="status">{notice}</p>}
    </div>
  );
};

export default VerifyEmail;
