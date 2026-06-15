import { queryOptions } from '@tanstack/react-query'
import { fetchProducts } from './api'
import type { ProductsResponse } from '@shared/types'

/**
 * Stable query key for the PLP list. MUST be exactly `['products']` on both the
 * server prefetch and the client read — including `baseUrl` here would desync
 * the dehydrated cache key from the client key and break hydration.
 */
export const PRODUCTS_QUERY_KEY = ['products'] as const

/**
 * Shared query definition consumed by:
 *  - the server prefetch (`entry-server.tsx`) with `baseUrl = origin`
 *  - the client hook (`useProducts`) with `baseUrl = ''`
 *
 * Centralising it in `queryOptions` guarantees key + fetcher stay identical
 * across both call sites, which is what makes the hydration deterministic.
 */
export function productsQueryOptions(baseUrl: string) {
  return queryOptions<ProductsResponse>({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: () => fetchProducts(baseUrl),
  })
}
