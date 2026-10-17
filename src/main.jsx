import React from 'react'
import { createRoot } from 'react-dom/client'
import CVOptimizer from './App.jsx'
import LegalPage, { LEGAL_PAGES } from '../components/LegalPage.jsx'
import FeedbackWidget from '../components/FeedbackWidget.jsx'
import { installErrorCapture } from '../services/feedback.js'
import './index.css'
import { initMetaPixel } from './metaPixel.js'

initMetaPixel()

// The app has no router. The legal pages are the only other URLs, and Vercel already rewrites
// every path to index.html, so a pathname check is all they need.
const path = window.location.pathname.replace(/\/+$/, '') || '/'

// Before the first render, so errors thrown while the app starts up are caught too.
installErrorCapture()

// The Feedback button sits beside the page rather than inside it, so it is on every screen.
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {LEGAL_PAGES[path] ? <LegalPage path={path} /> : <CVOptimizer />}
    <FeedbackWidget />
  </React.StrictMode>
)
