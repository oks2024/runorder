import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initWebAnalytics } from '@/api/analytics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Traffic (pageviews/visitors) is owned by Cloudflare Web Analytics — a cookieless beacon that
// hits Cloudflare's endpoint, not our Functions/D1, so it stays free on the free plan. The
// first-party `/api/events` pipeline is reserved for product actions Web Analytics can't see.
// Best-effort and outside React: no-ops under Do-Not-Track, never affects rendering.
initWebAnalytics()
