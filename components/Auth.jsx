import React, { useEffect, useState, useRef } from 'react';
import {
  signInWithGoogle,
  signInWithGithub,
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  signOutUser,
  friendlyAuthError,
} from '../services/auth.js';
import { Moon, CreditCard, FolderOpen, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { isFolderApiSupported, getStoredFolderName, pickNewFolder } from '../services/folderManager.js';

const RETURNING_KEY = 'rb_returning';

// localStorage can throw (private mode, blocked storage); the form works either way.
const readReturning = () => {
  try {
    return window.localStorage.getItem(RETURNING_KEY) === '1';
  } catch {
    return false;
  }
};

const writeReturning = () => {
  try {
    window.localStorage.setItem(RETURNING_KEY, '1');
  } catch {
    // Not remembered; the next visit opens on sign-up.
  }
};

const focusRing = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-berry/20';
const providerButtonClass = `inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-white px-4 text-base font-semibold text-ink transition-colors hover:border-[#D9C9D0] hover:bg-blush disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
const primaryButtonClass = 'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-berry px-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-berry-dark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-berry/30';
const inputClass = 'h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-ink-faint transition focus:border-berry focus:outline-none focus:ring-4 focus:ring-berry/15';
const labelClass = 'mb-1.5 block text-sm font-semibold text-ink';
const linkButtonClass = `rounded font-semibold text-berry underline-offset-4 hover:text-berry-dark hover:underline disabled:opacity-60 ${focusRing}`;

// Shared with VerifyEmail so the signed-out screens use one set of buttons and message boxes.
export const authButtonClasses = { primary: primaryButtonClass, secondary: providerButtonClass };

export const ErrorBox = ({ children }) => (
  <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3 py-2.5 text-left text-sm text-[#B42318]">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export const NoticeBox = ({ children }) => (
  <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-[#CFE7D8] bg-leaf-soft px-3 py-2.5 text-left text-sm text-leaf-text">
    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

const Auth = ({ user, onAuthChange, onToggleTheme, isDark, folderMgmtEnabled, onToggleFolderMgmt, initialMode, onModeChange, onManageSubscription, manageBusy }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const [folderName, setFolderName] = useState(null);

  const [folderError, setFolderError] = useState('');
  // Bumped by every explicit pick. A folder-name read that started earlier must not
  // overwrite a newer pick — that race is what blanked the field after choosing.
  const folderReadRef = useRef(0);

  // Re-read when the dropdown opens, since a folder chosen during a download goes
  // straight through folderManager and this component never hears about it.
  useEffect(() => {
    if (!folderMgmtEnabled || !isFolderApiSupported()) {
      folderReadRef.current++;
      setFolderName(null);
      return;
    }
    const read = ++folderReadRef.current;
    getStoredFolderName().then((name) => {
      // Ignore a stale read, and never clobber a known name with nothing.
      if (folderReadRef.current !== read) return;
      if (name) setFolderName(name);
    });
  }, [folderMgmtEnabled, showDropdown]);

  const handleChangeFolder = async () => {
    setFolderError('');
    console.log('[folder] Choose clicked');
    try {
      const handle = await pickNewFolder();
      console.log('[folder] picker resolved with "%s"', handle?.name);
      folderReadRef.current++;            // this pick wins over any in-flight read
      setFolderName(handle?.name || null);
      if (!handle?.name) setFolderError('The picker returned no folder.');
    } catch (err) {
      if (err?.name === 'AbortError') {
        console.log('[folder] picker cancelled by the user');
        return;
      }
      console.warn('[folder] could not pick a folder: %s', err?.name || err?.message || err);
      const wedged = err?.name === 'PICKER_TIMEOUT' || /already active|already in progress/i.test(err?.message || '');
      setFolderError(
        wedged
          ? 'Chrome is not responding to the folder picker. Restart Chrome to clear it — downloads still work without folder management.'
          : `Could not open the folder picker (${err?.name || 'error'}).`
      );
    }
  };

  // Signed-out form state
  // New visitors land on sign-up; someone who has signed in on this browser before lands on sign-in.
  const [mode, setMode] = useState(() => initialMode || (readReturning() ? 'signin' : 'signup')); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(null); // 'google' | 'github' | 'email' | 'reset'
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const emailRef = useRef(null);

  const showError = (error) => {
    console.warn('[auth] sign-in failed: %s', error?.code || error?.message);
    const message = error?.friendly || friendlyAuthError(error);
    if (message) setAuthError(message);
    // Account exists under another method: prefill the email so signing in that way is one step.
    if (error?.email) {
      setEmail(error.email);
      setMode('signin');
    }
  };

  const runSignIn = async (kind, fn) => {
    setAuthError('');
    setAuthNotice('');
    setBusy(kind);
    try {
      const signedIn = await fn();
      onAuthChange(signedIn);
      writeReturning();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (mode === 'signup') {
      runSignIn('email', () => signUpWithEmail(email, password));
    } else {
      runSignIn('email', () => signInWithEmail(email, password));
    }
  };

  const handleForgotPassword = async () => {
    setAuthError('');
    setAuthNotice('');
    if (!email.trim()) {
      setAuthError('Enter your email above, then click Forgot password again.');
      return;
    }
    setBusy('reset');
    try {
      await sendPasswordReset(email);
      setAuthNotice(`If ${email.trim()} has an account, a reset link is on its way.`);
    } catch (error) {
      // A missing account is reported the same as success, so this does not reveal who signed up.
      if (error?.code === 'auth/user-not-found') {
        setAuthNotice(`If ${email.trim()} has an account, a reset link is on its way.`);
      } else {
        showError(error);
      }
    } finally {
      setBusy(null);
    }
  };

  const switchMode = () => {
    const next = mode === 'signin' ? 'signup' : 'signin';
    setMode(next);
    onModeChange?.(next);
    // On the dedicated pages, keep the address bar in step with the form.
    if (['/login', '/signup'].includes(window.location.pathname.replace(/\/+$/, ''))) {
      window.history.replaceState(null, '', next === 'signup' ? '/signup' : '/login');
    }
    setAuthError('');
    setAuthNotice('');
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      onAuthChange(null);
      setShowDropdown(false);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  if (user) {
    const nameWords = String(user.displayName || '').trim().split(/\s+/).filter(Boolean);
    const initials = (nameWords.length
      ? nameWords.slice(0, 2).map((w) => w[0]).join('')
      : String(user.email || 'U')[0]).toUpperCase();
    return (
      <div className="relative flex items-center gap-3">
        <button
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          className="h-9 w-9 rounded-full overflow-hidden ring-2 ring-white/15 hover:ring-white/40 focus-visible:outline-none focus-visible:ring-white/60"
          aria-label="Account menu"
        >
          {user.photoURL ? (
            <img src={user.photoURL} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center bg-berry text-[13px] font-bold text-white">{initials}</span>
          )}
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            ></div>
            <div className="absolute right-0 top-11 z-20 w-72 rounded-xl border border-line bg-white py-2 text-ink shadow-xl">
              <div className="px-4 py-2 border-b border-line">
                <p className="text-sm font-semibold">{user.displayName || user.email}</p>
                <p className="text-xs text-ink-muted">{user.email}</p>
              </div>
              {onToggleTheme && (
                <div className="px-4 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Moon className="h-4 w-4 text-ink-muted" />
                    <span className="text-sm">Dark mode</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(isDark)}
                    aria-label="Dark mode"
                    onClick={onToggleTheme}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${isDark ? 'bg-berry' : 'bg-line'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isDark ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
              )}
              {onToggleFolderMgmt && (
                <>
                  <div className={`px-4 py-2 flex items-center justify-between gap-3 border-t border-line ${!isFolderApiSupported() ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-ink-muted" />
                      <span className="text-sm" title={!isFolderApiSupported() ? 'Not supported in this browser' : ''}>
                        Folder management
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!isFolderApiSupported()}
                      onClick={() => onToggleFolderMgmt(!folderMgmtEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${folderMgmtEnabled ? 'bg-berry' : 'bg-line'}`}
                    >
                      <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${folderMgmtEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {folderMgmtEnabled && isFolderApiSupported() && (
                    <div className="px-4 py-2 flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={folderName || 'No folder selected'}
                        className="min-w-0 flex-1 text-xs bg-blush border-line text-ink-muted rounded px-2 py-1 border truncate"
                        title={folderName || 'No folder selected'}
                      />
                      <button
                        type="button"
                        onClick={handleChangeFolder}
                        className="text-xs px-2 py-1 bg-berry-soft text-berry-dark hover:bg-[#F6D3DF] rounded border border-berry-line whitespace-nowrap transition-colors"
                      >
                        {folderName ? 'Change' : 'Choose'}
                      </button>
                    </div>
                  )}
                  {folderMgmtEnabled && folderError && (
                    <div className="px-4 pb-2 text-xs text-danger-text">{folderError}</div>
                  )}
                </>
              )}
              {onManageSubscription && (
                <button
                  type="button"
                  onClick={() => { setShowDropdown(false); onManageSubscription(); }}
                  disabled={manageBusy}
                  className="w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-ink hover:bg-blush border-t border-line disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4 text-ink-muted" />
                  Manage subscription
                </button>
              )}
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm hover:bg-blush transition-colors border-t border-line"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const isSignup = mode === 'signup';
  const spinner = <Loader2 className="h-5 w-5 animate-spin text-ink-muted" aria-hidden="true" />;

  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight text-ink">
        {isSignup ? 'Create your account' : 'Welcome back'}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {isSignup ? 'Your first 5 runs are on us. No card needed.' : 'Sign in to pick up where you left off.'}
      </p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={() => runSignIn('google', signInWithGoogle)}
          disabled={!!busy}
          className={providerButtonClass}
        >
          {busy === 'google' ? spinner : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          <span>Continue with Google</span>
        </button>

        <button
          type="button"
          onClick={() => runSignIn('github', signInWithGithub)}
          disabled={!!busy}
          className={providerButtonClass}
        >
          {busy === 'github' ? spinner : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#181717"
                d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"
              />
            </svg>
          )}
          <span>Continue with GitHub</span>
        </button>
      </div>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium text-ink-muted">or use email</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div>
          <label htmlFor="auth-email" className={labelClass}>Email</label>
          <input
            id="auth-email"
            ref={emailRef}
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor="auth-password" className="block text-sm font-semibold text-ink">Password</label>
            {!isSignup && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={!!busy}
                className={`text-sm ${linkButtonClass}`}
              >
                {busy === 'reset' ? 'Sending…' : 'Forgot password?'}
              </button>
            )}
          </div>
          <div className="relative">
            <input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={isSignup ? 6 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 6 characters' : ''}
              aria-describedby={isSignup ? 'auth-password-help' : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className={`absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-ink-muted hover:text-ink ${focusRing}`}
            >
              {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
          {isSignup && (
            <p id="auth-password-help" className="mt-1.5 text-xs text-ink-muted">Use 6 or more characters.</p>
          )}
        </div>
        <button type="submit" disabled={!!busy} className={primaryButtonClass}>
          {busy === 'email' ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>{isSignup ? 'Creating account…' : 'Signing in…'}</span>
            </>
          ) : (
            <span>{isSignup ? 'Create account' : 'Sign in'}</span>
          )}
        </button>
      </form>

      {authError && <ErrorBox>{authError}</ErrorBox>}
      {authNotice && <NoticeBox>{authNotice}</NoticeBox>}

      <p className="mt-6 text-center text-sm text-ink-muted">
        {isSignup ? 'Already have an account?' : 'New here?'}{' '}
        <button type="button" onClick={switchMode} className={linkButtonClass}>
          {isSignup ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  );
};

export default Auth;
