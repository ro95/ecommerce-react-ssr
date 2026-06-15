import type { CartItem, CartTotals } from '@shared/types'

/**
 * Pure derivation of cart totals from items. Kept out of the store/components
 * so it is trivially unit-testable and reused by both the badge and the cart
 * page. Totals are never persisted as source of truth (see PersistedCart).
 */
export function computeTotals(items: CartItem[]): CartTotals {
  return items.reduce<CartTotals>(
    (acc, item) => ({
      itemCount: acc.itemCount + item.quantity,
      subtotal: acc.subtotal + item.product.price * item.quantity,
    }),
    { itemCount: 0, subtotal: 0 },
  )
}
