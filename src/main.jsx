import React from 'react'
import { createRoot } from 'react-dom/client'
import CVOptimizer from './App.jsx'
import LegalPage, { LEGAL_PAGES } from '../components/LegalPage.jsx'
import './index.css'

// The app has no router. The legal pages are the only other URLs, and Vercel already rewrites
// every path to index.html, so a pathname check is all they need.
const path = window.location.pathname.replace(/\/+$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {LEGAL_PAGES[path] ? <LegalPage path={path} /> : <CVOptimizer />}
  </React.StrictMode>
)
