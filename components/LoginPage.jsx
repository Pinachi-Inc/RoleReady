import React, { useState } from 'react';
import Auth from './Auth.jsx';

const headerLink = 'rounded-lg px-3.5 h-10 inline-flex items-center text-sm font-semibold text-white/90 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30';
const footerLink = 'text-[#FBEFF3]/70 hover:text-white';

// Sign-in and sign-up on their own paths (/login and /signup). The landing page only links here.
const LoginPage = ({ mode, onAuthChange }) => {
  const [m, setM] = useState(mode);
  return (
    <div className="font-brand min-h-screen flex flex-col bg-ink text-[#FBEFF3]">
      <header className="flex items-center justify-between gap-3 px-5 sm:px-7 py-5">
        <a href="/"><img src="/roleberry-logo-dark.svg" alt="Roleberry home" className="h-8 w-auto" /></a>
        {m === 'signin'
          ? <a href="/signup" className={headerLink}>New here? Start free</a>
          : <a href="/login" className={headerLink}>Have an account? Sign in</a>}
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-12">
        <div className="w-full max-w-[440px] rounded-[20px] bg-white p-6 sm:p-8 text-ink shadow-2xl shadow-black/30">
          <Auth user={null} onAuthChange={onAuthChange} initialMode={mode} onModeChange={setM} />
          <p className="mt-6 border-t border-line pt-4 text-center text-xs leading-relaxed text-ink-muted">
            By continuing you agree to the{' '}
            <a href="/terms" className="font-medium text-ink underline underline-offset-2 hover:text-berry">Terms of Service</a>
            {' '}and acknowledge the{' '}
            <a href="/privacy" className="font-medium text-ink underline underline-offset-2 hover:text-berry">Privacy Policy</a>.
          </p>
        </div>
      </main>
      <footer className="flex justify-center gap-5 px-4 pb-6 text-[13px]">
        <a href="/terms" className={footerLink}>Terms</a>
        <a href="/privacy" className={footerLink}>Privacy</a>
        <a href="mailto:support@roleberry.app" className={footerLink}>support@roleberry.app</a>
      </footer>
    </div>
  );
};

export default LoginPage;
