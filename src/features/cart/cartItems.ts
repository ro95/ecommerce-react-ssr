import type { CartItem, Product } from '@shared/types'

/**
 * Pure cart-item transformations. No store, no React, no side effects — this is
 * the testable core of the cart. The Zustand store calls these to produce its
 * next state, and the optimistic snapshot/rollback in the XState flow relies on
 * them being deterministic.
 */

export function addItem(items: CartItem[], product: Product, quantity = 1): CartItem[] {
  const existing = items.find((item) => item.product.id === product.id)

  if (existing) {
    return items.map((item) =>
      item.product.id === product.id
        ? { ...item, quantity: item.quantity + quantity }
        : item,
    )
  }

  return [...items, { product, quantity }]
}

export function removeItem(items: CartItem[], productId: Product['id']): CartItem[] {
  return items.filter((item) => item.product.id !== productId)
}

/**
 * Set an absolute quantity. A quantity <= 0 removes the line (a cart line with
 * zero quantity is meaningless), which keeps the UI invariant simple.
 */
export function setQuantity(
  items: CartItem[],
  productId: Product['id'],
  quantity: number,
): CartItem[] {
  if (quantity <= 0) {
    return removeItem(items, productId)
  }

  return items.map((item) =>
    item.product.id === productId ? { ...item, quantity } : item,
  )
}
