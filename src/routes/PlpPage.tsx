import type { ReactNode } from 'react'
import styles from './PlpPage.module.css'

/**
 * Product List Page (route `/`). Placeholder for Phase 1 — the product grid,
 * data fetching (TanStack Query + SSR prefetch) and performance patterns land
 * in Phase 2.
 */
export function PlpPage(): ReactNode {
  return (
    <section className={styles.page} aria-labelledby="plp-title">
      <h1 id="plp-title" className={styles.title}>
        Products
      </h1>
      <p className={styles.placeholder}>Product gallery coming soon.</p>
    </section>
  )
}
