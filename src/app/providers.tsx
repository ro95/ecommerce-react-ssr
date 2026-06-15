import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  HydrationBoundary,
  type DehydratedState,
} from '@tanstack/react-query'

interface ProvidersProps {
  /** The QueryClient instance: per-request on the server, singleton on the client. */
  client: QueryClient
  /**
   * Server-dehydrated cache to rehydrate on the client. `undefined` on the
   * server render and until Phase 2 wires real prefetching; `HydrationBoundary`
   * is a no-op in that case, so it is safe to always mount.
   */
  dehydratedState?: DehydratedState
  children: ReactNode
}

/**
 * Shared provider tree (server and client). The router itself is injected by
 * `App` so this stays transport-agnostic (StaticRouter vs BrowserRouter).
 *
 * Phase 2: the server will `dehydrate(client)` after prefetching the PLP query
 * and serialize the result into the HTML; the client passes it here as
 * `dehydratedState` so the first paint has data with zero refetch / mismatch.
 */
export function Providers({
  client,
  dehydratedState,
  children,
}: ProvidersProps): ReactNode {
  return (
    <QueryClientProvider client={client}>
      <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
    </QueryClientProvider>
  )
}
