import type { ReactNode } from 'react'
import type { Product } from '@shared/types'
import { formatPrice } from '@/lib/format'
import { useCart } from '@/features/cart/useCart'
import { Rating } from './Rating'
import { HighlightedText } from './HighlightedText'
import styles from './ProductCard.module.css'

/**
 * Fixed image box dimensions. Reserving the aspect ratio in CSS (not just here)
 * prevents cumulative layout shift while the product image loads.
 */
const IMAGE_SIZE = 240

interface ProductCardProps {
  product: Product
  /**
   * Eager-load above-the-fold images (first row) to improve LCP; lazy-load the
   * rest. The grid passes `priority` for the first N cards.
   */
  priority?: boolean
  /** Active search term — highlights the matching substring in the title. */
  highlightQuery?: string
}

export function ProductCard({
  product,
  priority = false,
  highlightQuery = '',
}: ProductCardProps): ReactNode {
  const { addProduct } = useCart()

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <img
          className={styles.image}
          src={product.image}
          alt={product.title}
          width={IMAGE_SIZE}
          height={IMAGE_SIZE}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </div>
      <div className={styles.body}>
        <h2 className={styles.title} title={product.title}>
          <HighlightedText text={product.title} query={highlightQuery} />
        </h2>
        <Rating rating={product.rating} />
        <div className={styles.footer}>
          <span className={styles.price}>{formatPrice(product.price)}</span>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => addProduct(product)}
          >
            Add to cart
            <span className={styles.srOnly}> {product.title}</span>
          </button>
        </div>
      </div>
    </article>
  )
}
