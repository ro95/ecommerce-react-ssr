import { Suspense, lazy, type ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from '@/components/layout/Layout'
import { PlpPage } from '@/routes/PlpPage'
import { NotFoundPage } from '@/routes/NotFoundPage'
import { RouteFallback } from '@/app/RouteFallback'

/**
 * Route-based code splitting.
 *
 * The PLP is the entry route and the perf-critical path, so it stays eager
 * (bundled in the initial chunk) for the fastest first paint. The Cart route —
 * with its heavier dependency graph (XState machine, Zustand store, cart
 * components) — is `lazy`-loaded so none of it ships in the initial bundle.
 * `React.lazy` needs a default export; our pages use named exports, hence the
 * `.then` remap.
 */
const CartPage = lazy(() =>
  import('@/routes/CartPage').then((module) => ({ default: module.CartPage })),
)

/**
 * Declarative route table, transport-agnostic: the same element tree renders
 * under `StaticRouter` (server) and `BrowserRouter` (client). The router
 * provider itself is supplied by `App` so this module stays environment-free.
 *
 * SSR-safety of the lazy Cart route: the `<Suspense>` boundary lets
 * `renderToPipeableStream` await the dynamic `import()` (already part of the
 * module graph at render time) before flushing the shell, so the server emits
 * the REAL cart markup, not the fallback — no hydration mismatch. On the client
 * the same boundary shows `RouteFallback` only while the Cart chunk downloads
 * during a client-side navigation.
 */
export function AppRoutes(): ReactNode {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PlpPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
