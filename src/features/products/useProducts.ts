import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { productsQueryOptions } from './queries'
import type { ProductsResponse } from '@shared/types'

/**
 * Client hook for the PLP list. Uses the same `queryOptions` as the SSR
 * prefetch, so after hydration the cache is already populated (`staleTime`
 * prevents an immediate refetch) and the first paint shows server data.
 *
 * Client base URL is '' → same-origin request to the BFF.
 */
export function useProducts(): UseQueryResult<ProductsResponse, Error> {
  return useQuery(productsQueryOptions(''))
}
