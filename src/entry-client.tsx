import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import type { DehydratedState } from '@tanstack/react-query'
import { App } from '@/App'
import { getClientQueryClient } from '@/app/queryClient'
import { reportWebVitals } from '@/lib/reportWebVitals'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" not found — cannot hydrate.')
}

/**
 * Read the server-serialized dehydrated query cache from the non-executable
 * `<script type="application/json">` injected by the server. `JSON.parse` of a
 * data-only script is safe; we keep it in a try/catch so a malformed payload
 * degrades to a normal client fetch instead of crashing hydration.
 */
function readDehydratedState(): DehydratedState | undefined {
  const raw = document.getElementById('__RQ_STATE__')?.textContent
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as DehydratedState
  } catch {
    return undefined
  }
}

/**
 * Client entrypoint: hydrate the server-rendered HTML in place, reusing the
 * SAME `App` tree as the server (BrowserRouter vs StaticRouter) so markup
 * matches. The dehydrated cache means the PLP has its data immediately — zero
 * refetch, zero mismatch on first paint.
 */
hydrateRoot(
  rootElement,
  <StrictMode>
    <App
      queryClient={getClientQueryClient()}
      router={BrowserRouter}
      dehydratedState={readDehydratedState()}
    />
  </StrictMode>,
)

// Core Web Vitals reporting — client-only, after hydration so measurement does
// not compete with the critical hydration work. Logs to console in dev; the
// reporter exposes a beacon extension point for a future telemetry endpoint.
reportWebVitals()
