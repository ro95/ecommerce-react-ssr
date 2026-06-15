import { StrictMode, type ReactNode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { App } from '@/App'
import { createQueryClient } from '@/app/queryClient'

/**
 * SSR contract consumed by the Express server (`/server`).
 *
 * The server calls `render(url, callbacks)`, writes the `index.html` head up to
 * `<!--app-html-->`, pipes this stream into the response on `onShellReady`, then
 * writes the template tail. Keep this signature in sync with `server/ssr.ts`.
 */
export interface RenderCallbacks {
  onShellReady: () => void
  onShellError: (error: unknown) => void
  onAllReady: () => void
  onError: (error: unknown) => void
}

export interface RenderResult {
  pipe: (writable: NodeJS.WritableStream) => void
  abort: () => void
}

export function render(url: string, callbacks: RenderCallbacks): RenderResult {
  // One QueryClient per request — never shared across requests on the server.
  // Phase 2: prefetch the PLP query here, then `dehydrate(queryClient)` and
  // serialize the state into the streamed HTML for a zero-refetch hydration.
  const queryClient = createQueryClient()

  // StaticRouter needs the request URL; the shared `App` injects the router as a
  // children-only provider, so we close over `url` here to stay contract-compatible
  // with the client's `BrowserRouter`.
  const ServerRouter = ({ children }: { children: ReactNode }): ReactNode => (
    <StaticRouter location={url}>{children}</StaticRouter>
  )

  const { pipe, abort } = renderToPipeableStream(
    <StrictMode>
      <App queryClient={queryClient} router={ServerRouter} />
    </StrictMode>,
    {
      onShellReady: callbacks.onShellReady,
      onShellError: callbacks.onShellError,
      onAllReady: callbacks.onAllReady,
      onError: callbacks.onError,
    },
  )

  return { pipe, abort }
}
