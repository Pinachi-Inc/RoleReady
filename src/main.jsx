import React from 'react'
import { createRoot } from 'react-dom/client'
import CVOptimizer from './App.jsx'
import LegalPage, { LEGAL_PAGES } from '../components/LegalPage.jsx'
import AuthActionPage from '../components/AuthActionPage.jsx'
import FeedbackWidget from '../components/FeedbackWidget.jsx'
import { DialogProvider } from '../components/Dialog.jsx'
import { installErrorCapture } from '../services/feedback.js'
import './index.css'
import { initMetaPixel } from './metaPixel.js'
import { initRedditPixel } from './redditPixel.js'
import { captureFirstTouch } from './attribution.js'
import { applySeoTags } from './seo.js'

// The app has no router. The legal pages and the email-link page are the only other URLs, and
// Vercel already rewrites every path to index.html, so a pathname check is all they need.
const path = window.location.pathname.replace(/\/+$/, '') || '/'

// Links from our verification and reset emails carry a one-time code in the URL, so that page
// loads no ad pixels and is never recorded as where a visitor came from.
const AUTH_ACTION_PATH = '/auth/action'
if (path !== AUTH_ACTION_PATH) {
  // Remember where this visitor came from before anything else touches the URL.
  captureFirstTouch()
  initMetaPixel()
  initRedditPixel()
}

applySeoTags(path, ['/', '/login', '/signup', ...Object.keys(LEGAL_PAGES)])
applySeoTags(path, ['/', '/login', '/signup', ...Object.keys(LEGAL_PAGES)])

// Before the first render, so errors thrown while the app starts up are caught too.
installErrorCapture()

// The Feedback button sits beside the page rather than inside it, so it is on every screen.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      {path === AUTH_ACTION_PATH ? <AuthActionPage /> : LEGAL_PAGES[path] ? <LegalPage path={path} /> : <CVOptimizer />}
      <FeedbackWidget />
    </DialogProvider>
  </React.StrictMode>
)
