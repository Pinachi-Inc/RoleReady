import React from 'react'
import { createRoot } from 'react-dom/client'
import CVOptimizer from './App.jsx'
import LegalPage, { LEGAL_PAGES } from '../components/LegalPage.jsx'
import FeedbackWidget from '../components/FeedbackWidget.jsx'
import { DialogProvider } from '../components/Dialog.jsx'
import { installErrorCapture } from '../services/feedback.js'
import './index.css'
import { initMetaPixel } from './metaPixel.js'
import { initRedditPixel } from './redditPixel.js'
import { captureFirstTouch } from './attribution.js'

// Remember where this visitor came from before anything else touches the URL.
captureFirstTouch()
initMetaPixel()
initRedditPixel()

// The app has no router. The legal pages are the only other URLs, and Vercel already rewrites
// every path to index.html, so a pathname check is all they need.
const path = window.location.pathname.replace(/\/+$/, '') || '/'

// Before the first render, so errors thrown while the app starts up are caught too.
installErrorCapture()

// The Feedback button sits beside the page rather than inside it, so it is on every screen.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DialogProvider>
      {LEGAL_PAGES[path] ? <LegalPage path={path} /> : <CVOptimizer />}
      <FeedbackWidget />
    </DialogProvider>
  </React.StrictMode>
)
