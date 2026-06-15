import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCart } from '@/features/cart/useCart'
import { useHydrateCart } from '@/features/cart/useHydrateCart'
import { CartLine } from '@/features/cart/components/CartLine'
import { formatPrice } from '@/lib/format'
import styles from './CartPage.module.css'

/**
 * Cart Page (route `/cart`).
 *
 * The cart lives entirely client-side (persisted in localStorage). It renders
 * empty on the server (no localStorage there), then `useHydrateCart` loads the
 * persisted items after mount — an accepted, documented post-hydration update.
 * Mutations are optimistic (UI updates instantly) with rollback on sync error
 * surfaced via the `error` banner.
 */
export function CartPage(): ReactNode {
  const hydrated = useHydrateCart()
  const {
    items,
    totals,
    error,
    isSyncing,
    addProduct,
    setProductQuantity,
    removeProduct,
    retry,
    dismissError,
  } = useCart()

  return (
    <section className={styles.page} aria-labelledby="cart-title" aria-busy={isSyncing}>
      <h1 id="cart-title" className={styles.title}>
        Cart
      </h1>

      {error ? (
        <div role="alert" className={styles.errorBanner}>
          <span>{error}</span>
          <span className={styles.errorActions}>
            <button type="button" className={styles.linkButton} onClick={retry}>
              Retry
            </button>
            <button type="button" className={styles.linkButton} onClick={dismissError}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}

      {!hydrated ? (
        <p className={styles.message} aria-live="polite">
          Loading your cart…
        </p>
      ) : items.length === 0 ? (
        <div className={styles.message}>
          <p>Your cart is empty.</p>
          <Link to="/" className={styles.cta}>
            Browse products
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.lines}>
            {items.map((item) => (
              <CartLine
                key={item.product.id}
                item={item}
                onIncrement={() => addProduct(item.product, 1)}
                onDecrement={() =>
                  setProductQuantity(item.product.id, item.quantity - 1)
                }
                onRemove={() => removeProduct(item.product.id)}
              />
            ))}
          </ul>

          <div className={styles.summary}>
            <span className={styles.summaryLabel}>
              Subtotal ({totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'})
            </span>
            <span className={styles.summaryValue}>{formatPrice(totals.subtotal)}</span>
          </div>
        </>
      )}
    </section>
  )
}
