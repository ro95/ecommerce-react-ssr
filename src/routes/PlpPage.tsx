import type { ReactNode } from 'react'
import { useProducts } from '@/features/products/useProducts'
import { ProductGrid, ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import styles from './PlpPage.module.css'

/**
 * Product List Page (route `/`).
 *
 * Data flows through TanStack Query. On SSR the query is prefetched and
 * dehydrated (see entry-server), so this renders fully populated on the server
 * and hydrates with zero refetch. The loading branch only appears in pure
 * client navigations or if the SSR prefetch failed (graceful degradation:
 * the client refetches).
 */
export function PlpPage(): ReactNode {
  const { data, isLoading, isError, refetch } = useProducts()

  const products = data?.products ?? []

  return (
    <section className={styles.page} aria-labelledby="plp-title">
      <h1 id="plp-title" className={styles.title}>
        Products
      </h1>

      {isLoading ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className={styles.srOnly}>Loading products…</span>
          <ProductGridSkeleton />
        </div>
      ) : isError ? (
        <div role="alert" className={styles.message}>
          <p>We could not load the products. Please try again.</p>
          <button type="button" className={styles.retry} onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      ) : products.length === 0 ? (
        <p className={styles.message}>No products available right now.</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </section>
  )
}
