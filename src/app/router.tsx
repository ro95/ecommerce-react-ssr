import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { Layout } from '@/components/layout/Layout'
import { PlpPage } from '@/routes/PlpPage'
import { CartPage } from '@/routes/CartPage'
import { NotFoundPage } from '@/routes/NotFoundPage'

/**
 * Declarative route table, transport-agnostic: the same element tree renders
 * under `StaticRouter` (server) and `BrowserRouter` (client). The router
 * provider itself is supplied by `App` so this module stays environment-free.
 *
 * Phase 2: route-based code splitting (React.lazy) can wrap the page elements
 * here without touching the SSR wiring.
 */
export function AppRoutes(): ReactNode {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PlpPage />} />
        <Route path="cart" element={<CartPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
