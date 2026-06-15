import { QueryClient } from '@tanstack/react-query'

/**
 * Factory for a fresh QueryClient.
 *
 * SSR rule: one client PER REQUEST on the server (never shared across requests,
 * or one user's data leaks into another's). On the client we keep a singleton
 * (see `getClientQueryClient`) so the cache survives navigations.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // SSR-friendly default: avoid an immediate client refetch of data that
        // was just dehydrated from the server render.
        staleTime: 60_000,
        // We never want SSR to hang on retries; the server uses its own timeout.
        retry: 1,
      },
      dehydrate: {
        // Phase 2: include pending queries so streamed/in-flight data can be
        // dehydrated once we start prefetching on the server.
        shouldDehydrateQuery: (query) =>
          query.state.status === 'success' || query.state.status === 'pending',
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * Client-side singleton. Created lazily on first access in the browser so that
 * a re-render during hydration reuses the same cache instance.
 */
export function getClientQueryClient(): QueryClient {
  browserQueryClient ??= createQueryClient()
  return browserQueryClient
}
