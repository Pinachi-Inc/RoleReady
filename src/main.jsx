import React from 'react'
import { createRoot } from 'react-dom/client'
import CVOptimizer from './App.jsx'
import './index.css'
import { SpeedInsights } from '@vercel/speed-insights/react'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CVOptimizer />
    <SpeedInsights />
  </React.StrictMode>
)


