import { useCallback, useMemo } from 'react'
import { useSelector } from '@xstate/react'
import type { CartItem, CartTotals, Product } from '@shared/types'
import { useCartStore } from './store'
import { computeTotals } from './totals'
import { useCartActor } from './CartProvider'
import type { CartMutation } from './cartMachine'

export interface UseCartResult {
  items: CartItem[]
  totals: CartTotals
  /** True while a server sync is in flight (UI stays interactive regardless). */
  isSyncing: boolean
  /** Non-null when the last sync failed and was rolled back. */
  error: string | null
  addProduct: (product: Product, quantity?: number) => void
  removeProduct: (productId: number) => void
  setProductQuantity: (productId: number, quantity: number) => void
  retry: () => void
  dismissError: () => void
}

/**
 * Cart facade for components. Composition of:
 *  - Zustand store          → source of truth + persistence (items),
 *  - the shared XState actor → optimistic-update orchestration + rollback,
 *  - pure totals            → derived view data.
 *
 * The machine is shared app-wide via CartProvider, so `isSyncing` / `error` are
 * coherent everywhere. Components never touch the store or actor directly; they
 * call these intent-named methods. The optimistic write happens immediately
 * (store commit inside the machine's MUTATE transition) so the UI updates
 * without waiting on the network; a failed sync rolls the store back.
 */
export function useCart(): UseCartResult {
  const items = useCartStore((state) => state.items)
  const actorRef = useCartActor()

  // Fine-grained subscriptions: re-render only when these specific slices change.
  const isSyncing = useSelector(actorRef, (state) => state.matches('syncing'))
  const error = useSelector(actorRef, (state) => state.context.error)

  const dispatch = useCallback(
    (mutation: CartMutation) => {
      // Read the LIVE store items at dispatch time (getState, not a render-time
      // snapshot) so every mutation builds on the current cart — across cards and
      // after rehydration — never a stale copy.
      const baseItems = useCartStore.getState().items
      actorRef.send({ type: 'MUTATE', mutation, baseItems })
    },
    [actorRef],
  )

  const addProduct = useCallback(
    (product: Product, quantity = 1) => dispatch({ type: 'add', product, quantity }),
    [dispatch],
  )
  const removeProduct = useCallback(
    (productId: number) => dispatch({ type: 'remove', productId }),
    [dispatch],
  )
  const setProductQuantity = useCallback(
    (productId: number, quantity: number) =>
      dispatch({ type: 'setQuantity', productId, quantity }),
    [dispatch],
  )

  const retry = useCallback(() => actorRef.send({ type: 'RETRY' }), [actorRef])
  const dismissError = useCallback(() => actorRef.send({ type: 'DISMISS' }), [actorRef])

  const totals = useMemo(() => computeTotals(items), [items])

  return {
    items,
    totals,
    isSyncing,
    error,
    addProduct,
    removeProduct,
    setProductQuantity,
    retry,
    dismissError,
  }
}
