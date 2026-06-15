import { StrictMode, type ReactNode } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { dehydrate } from '@tanstack/react-query'
import type { DehydratedState } from '@tanstack/react-query'
import { App } from '@/App'
import { createQueryClient } from '@/app/queryClient'
import { productsQueryOptions } from '@/features/products/queries'

/**
 * SSR contract v2 consumed by the Express server (`/server`).
 *
 * Flow per request:
 *  1. create a per-request QueryClient,
 *  2. PREFETCH the products query against `opts.origin` (so the PLP renders
 *     populated server-side),
 *  3. `dehydrate` the cache and serialize it into `headTags` as a NON-executable
 *     `<script type="application/json">` (CSP-friendly),
 *  4. render the tree (cache already warm → no client refetch on hydration).
 *
 * The server writes the template up to `<!--app-head-->` (replaced by `headTags`)
 * and `<!--app-html-->` (the streamed React shell). Keep this signature in sync
 * with `server/ssr.ts`.
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
  /** Injected by the server in place of `<!--app-head-->`. */
  headTags: string
}

export interface RenderOptions {
  /** Absolute origin of the current request, e.g. `http://localhost:5173`. */
  origin: string
  callbacks: RenderCallbacks
}

/** DOM id the client reads the dehydrated cache from. Keep in sync with entry-client. */
const RQ_STATE_ELEMENT_ID = '__RQ_STATE__'

/**
 * Serialize the dehydrated cache as JSON inside a non-executable script tag.
 *
 * `type="application/json"` is never executed by the browser, so this is safe
 * under a strict CSP (no inline-script execution needed). We escape `<` so a
 * malicious product string containing `</script>` cannot break out of the tag.
 */
function serializeQueryState(state: DehydratedState): string {
  const json = JSON.stringify(state).replace(/</g, '\\u003c')
  return `<script id="${RQ_STATE_ELEMENT_ID}" type="application/json">${json}</script>`
}

export async function render(url: string, opts: RenderOptions): Promise<RenderResult> {
  // One QueryClient per request — never shared across requests on the server.
  const queryClient = createQueryClient()

  // Prefetch the PLP data against the request origin. `prefetchQuery` swallows
  // errors (it never throws): if the BFF is down at SSR time we still produce a
  // shell, the dehydrated cache simply has no products, and the client refetches
  // / shows the error state. Server resilience over a hard 500.
  await queryClient.prefetchQuery(productsQueryOptions(opts.origin))

  const dehydratedState = dehydrate(queryClient)
  const headTags = serializeQueryState(dehydratedState)

  const ServerRouter = ({ children }: { children: ReactNode }): ReactNode => (
    <StaticRouter location={url}>{children}</StaticRouter>
  )

  const { pipe, abort } = renderToPipeableStream(
    <StrictMode>
      <App
        queryClient={queryClient}
        router={ServerRouter}
        dehydratedState={dehydratedState}
      />
    </StrictMode>,
    {
      onShellReady: opts.callbacks.onShellReady,
      onShellError: opts.callbacks.onShellError,
      onAllReady: opts.callbacks.onAllReady,
      onError: opts.callbacks.onError,
    },
  )

  return { pipe, abort, headTags }
}
