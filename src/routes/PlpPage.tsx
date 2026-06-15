import { useMemo, type ReactNode } from 'react'
import { useProducts } from '@/features/products/useProducts'
import { useProductFilters } from '@/features/products/useProductFilters'
import { filterProducts, deriveCategories } from '@/features/products/filterProducts'
import { ProductGrid, ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { ProductFilters } from '@/features/products/components/ProductFilters'
import styles from './PlpPage.module.css'

/**
 * Product List Page (route `/`).
 *
 * Data flows through TanStack Query. On SSR the query is prefetched and
 * dehydrated (see entry-server), so this renders fully populated on the server
 * and hydrates with zero refetch. The loading branch only appears in pure
 * client navigations or if the SSR prefetch failed (graceful degradation:
 * the client refetches).
 *
 * Search + category filters live entirely in the URL (`useProductFilters`):
 * because the server renders under `StaticRouter` with the request URL, the SSR
 * HTML already reflects `?q=…&category=…`. Filtering is the pure
 * `filterProducts` applied at render — NOT a new query — so the `['products']`
 * cache key stays stable and hydration is deterministic.
 */
export function PlpPage(): ReactNode {
  const { data, isLoading, isError, refetch } = useProducts()
  const { criteria, setQuery, toggleCategory, clearFilters, hasActiveFilters } =
    useProductFilters()

  const products = useMemo(() => data?.products ?? [], [data])

  const categories = useMemo(() => deriveCategories(products), [products])
  const visibleProducts = useMemo(
    () => filterProducts(products, criteria),
    [products, criteria],
  )

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
        <>
          <ProductFilters
            query={criteria.query}
            categories={categories}
            selectedCategories={criteria.categories}
            onQueryChange={setQuery}
            onToggleCategory={toggleCategory}
          />

          <p className={styles.resultCount} role="status" aria-live="polite">
            {visibleProducts.length} product{visibleProducts.length === 1 ? '' : 's'}
          </p>

          {visibleProducts.length === 0 ? (
            <div className={styles.message}>
              <p>No products match your filters.</p>
              {hasActiveFilters ? (
                <button type="button" className={styles.retry} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <ProductGrid products={visibleProducts} highlightQuery={criteria.query} />
          )}
        </>
      )}
    </section>
  )
}
