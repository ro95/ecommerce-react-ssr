import type { ReactNode } from 'react'
import type { Product } from '@shared/types'
import { ProductCard } from './ProductCard'
import { ProductCardSkeleton } from './ProductCardSkeleton'
import styles from './ProductGrid.module.css'

/** Number of leading cards eager-loaded for LCP (≈ first visible row at 1440). */
const PRIORITY_CARD_COUNT = 4
/** Skeleton placeholders shown while the list loads. */
const SKELETON_COUNT = 8

interface ProductGridProps {
  products: Product[]
}

export function ProductGrid({ products }: ProductGridProps): ReactNode {
  return (
    <ul className={styles.grid}>
      {products.map((product, index) => (
        <li key={product.id} className={styles.cell}>
          <ProductCard product={product} priority={index < PRIORITY_CARD_COUNT} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Skeleton grid shown during the (rare, post-SSR) loading state. Same grid
 * geometry as the real grid so swapping in real cards causes no layout shift.
 */
export function ProductGridSkeleton(): ReactNode {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: SKELETON_COUNT }, (_, index) => (
        <li key={index} className={styles.cell}>
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  )
}
