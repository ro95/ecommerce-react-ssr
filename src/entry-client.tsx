import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/App'
import { getClientQueryClient } from '@/app/queryClient'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element "#root" not found — cannot hydrate.')
}

/**
 * Client entrypoint: hydrate the server-rendered HTML in place.
 *
 * We reuse the SAME `App` tree as the server (BrowserRouter injected here vs
 * StaticRouter on the server) so markup matches and hydration produces no
 * mismatch.
 *
 * Phase 2: read the server-serialized dehydrated query state from the document
 * (e.g. `window.__REACT_QUERY_STATE__`) and pass it as `dehydratedState`.
 */
hydrateRoot(
  rootElement,
  <StrictMode>
    <App queryClient={getClientQueryClient()} router={BrowserRouter} />
  </StrictMode>,
)
