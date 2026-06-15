import type { ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import type { DehydratedState } from '@tanstack/react-query'
import { Providers } from '@/app/providers'
import { AppRoutes } from '@/app/router'
import { CartProvider } from '@/features/cart/CartProvider'

interface AppProps {
  /** QueryClient: per-request on the server, singleton on the client. */
  queryClient: QueryClient
  /**
   * Router provider injected by the entrypoints so the shared tree stays
   * transport-agnostic: `StaticRouter` (server) vs `BrowserRouter` (client).
   * Receives the route tree as `children`.
   */
  router: (props: { children: ReactNode }) => ReactNode
  /** Server-dehydrated query cache to rehydrate on the client (Phase 2). */
  dehydratedState?: DehydratedState
}

/**
 * Application root: the single tree shared by SSR and client hydration.
 * Keeping providers + routes here (rather than duplicating across entrypoints)
 * is what guarantees the server and client render identically — the basis for
 * a mismatch-free hydration.
 */
export function App({ queryClient, router: Router, dehydratedState }: AppProps): ReactNode {
  return (
    <Providers client={queryClient} dehydratedState={dehydratedState}>
      <CartProvider>
        <Router>
          <AppRoutes />
        </Router>
      </CartProvider>
    </Providers>
  )
}
