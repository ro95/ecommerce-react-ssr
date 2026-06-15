import type { ReactNode } from 'react'
import { useCartStore } from '@/features/cart/store'
import { useHydrateCart } from '@/features/cart/useHydrateCart'
import styles from './CartBadge.module.css'

/**
 * Cart item-count badge for the header.
 *
 * SSR-safe: renders nothing on the server and on the first client paint (the
 * persisted cart isn't read yet), then reveals the count once `useHydrateCart`
 * has loaded localStorage. The badge occupies a reserved, fixed-size slot in
 * the header, so revealing it causes no layout shift.
 *
 * Subscribes to a derived count selector so it only re-renders when the total
 * quantity changes, not on every unrelated store update.
 */
export function CartBadge(): ReactNode {
  const hydrated = useHydrateCart()
  const itemCount = useCartStore((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  )

  if (!hydrated || itemCount === 0) {
    return null
  }

  return (
    <span className={styles.badge} aria-label={`${itemCount} items in cart`}>
      {itemCount}
    </span>
  )
}
