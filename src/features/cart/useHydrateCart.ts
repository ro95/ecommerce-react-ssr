import { useEffect, useState } from 'react'
import { useCartStore } from './store'

/**
 * Explicit, client-only rehydration of the persisted cart.
 *
 * Because the store uses `skipHydration`, the persisted localStorage cart is
 * not loaded until we call `rehydrate()` here, inside an effect (effects never
 * run during SSR). This is the deliberate trade-off documented in the store:
 * the cart UI shows its empty/server state on the very first paint, then
 * reconciles to the persisted contents once mounted. That tiny, client-only
 * update is correct and avoids any server/client markup mismatch.
 *
 * Returns whether rehydration has completed so consumers can avoid flashing an
 * "empty cart" message before the persisted state is read.
 */
export function useHydrateCart(): boolean {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    void useCartStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  return hydrated
}
