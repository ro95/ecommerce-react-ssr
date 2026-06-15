import type { CartItem } from '@shared/types'

/**
 * Body sent to the BFF when syncing the cart. The server validates and echoes
 * success; it does NOT persist (FakeStore writes are simulated — see CLAUDE.md).
 * We send a minimal projection (id + quantity), not the full product objects.
 */
interface SyncCartBody {
  items: { productId: number; quantity: number }[]
}

/**
 * Failure-simulation hook for demonstrating the optimistic rollback.
 *
 * Set `window.__FORCE_CART_ERROR__ = true` in the browser console, then perform
 * any cart action: the sync below throws, the XState machine transitions to its
 * rollback state, and the store is restored to the pre-action snapshot. Set it
 * back to `false` to resume normal behaviour. This is a debug affordance only;
 * it has zero effect on the server.
 */
function shouldForceError(): boolean {
  if (typeof window === 'undefined') return false
  return (window as { __FORCE_CART_ERROR__?: boolean }).__FORCE_CART_ERROR__ === true
}

/** Simulated round-trip latency for the forced-error path, so the optimistic
 * update is observably applied before the rollback (mirrors a real network
 * failure rather than a synchronous throw). */
const FORCED_ERROR_DELAY_MS = 300

export async function syncCart(items: CartItem[]): Promise<void> {
  if (shouldForceError()) {
    await new Promise((resolve) => setTimeout(resolve, FORCED_ERROR_DELAY_MS))
    throw new Error('Forced cart sync failure (debug: __FORCE_CART_ERROR__).')
  }

  const body: SyncCartBody = {
    items: items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    })),
  }

  const response = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Cart sync failed: ${response.status} ${response.statusText}`)
  }
}
