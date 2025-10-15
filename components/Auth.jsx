import React, { useEffect, useState } from 'react';
import { signInWithGoogle, signOutUser } from '../services/auth.js';
import { Sun, Moon } from 'lucide-react';

const Auth = ({ user, onAuthChange, onToggleTheme, isDark }) => {
  const [showDropdown, setShowDropdown] = useState(false);

  // Debug: Check environment variables on component mount
  useEffect(() => {
    console.log('🔍 Environment Variables Check:');
    console.log('VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY ? 'SET' : 'MISSING');
    console.log('VITE_FIREBASE_AUTH_DOMAIN:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'MISSING');
    console.log('VITE_FIREBASE_PROJECT_ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID || 'MISSING');
    console.log('All env vars:', import.meta.env);
  }, []);

  const handleSignIn = async () => {
    try {
      console.log('🚀 Auth component: Starting sign-in process...');
      const user = await signInWithGoogle();
      console.log('✅ Auth component: Sign-in successful, updating state...');
      onAuthChange(user);
    } catch (error) {
      console.error('❌ Auth component: Sign in failed:', error);
      console.error('📋 Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      alert(`Sign in failed: ${error.message || 'Unknown error'}. Please try again.`);
    }
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
    return (
      <div className="relative flex items-center gap-3">
        <button
          onClick={onToggleTheme}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="w-10 h-10 rounded-full border-2 border-white/20 hover:border-white/40 transition-colors focus:outline-none focus:border-white/60"
        >
          <img 
            src={user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User') + '&background=0D8ABC&color=ffffff&size=128'} 
            alt={user.displayName || 'User'}
            className="w-full h-full rounded-full object-cover"
          />
        </button>
        
        {showDropdown && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowDropdown(false)}
            ></div>
            <div className="absolute top-12 right-0 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-48">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="font-medium text-gray-900 text-sm">{user.displayName}</p>
                <p className="text-xs text-gray-600">{user.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleSignIn}
      className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 font-medium text-gray-700"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
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
      <span>Continue with Google</span>
    </button>
  );
};

export default Auth;
