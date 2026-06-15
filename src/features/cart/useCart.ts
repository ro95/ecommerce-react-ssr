import { useCallback, useMemo } from 'react'
import { useMachine } from '@xstate/react'
import type { CartItem, CartTotals, Product } from '@shared/types'
import { useCartStore } from './store'
import { computeTotals } from './totals'
import { cartMachine } from './cartMachine'
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
 *  - Zustand store  → source of truth + persistence (items),
 *  - XState machine → optimistic-update orchestration + rollback,
 *  - pure totals    → derived view data.
 *
 * Components never touch the store or machine directly; they call these
 * intent-named methods. The optimistic write happens immediately (store commit
 * inside the machine's MUTATE transition) so the UI updates without waiting on
 * the network; a failed sync rolls the store back to the pre-mutation snapshot.
 */
export function useCart(): UseCartResult {
  const items = useCartStore((state) => state.items)
  const setItems = useCartStore((state) => state.setItems)

  const [snapshot, send] = useMachine(
    cartMachine.provide({
      actions: {
        // Bridge machine commits to the store — the store stays the single
        // source of truth and drives persistence + every subscribed component.
        commitItems: (_, params: { items: CartItem[] }) => {
          setItems(params.items)
        },
      },
    }),
    { input: { items } },
  )

  const dispatch = useCallback(
    (mutation: CartMutation) => {
      // Read the LIVE store items at dispatch time (getState, not a render-time
      // snapshot) so every mutation builds on the current cart — across cards and
      // after rehydration — instead of this machine instance's stale context.
      const baseItems = useCartStore.getState().items
      send({ type: 'MUTATE', mutation, baseItems })
    },
    [send],
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

  const retry = useCallback(() => send({ type: 'RETRY' }), [send])
  const dismissError = useCallback(() => send({ type: 'DISMISS' }), [send])

  const totals = useMemo(() => computeTotals(items), [items])

  return {
    items,
    totals,
    isSyncing: snapshot.matches('syncing'),
    error: snapshot.context.error,
    addProduct,
    removeProduct,
    setProductQuantity,
    retry,
    dismissError,
  }
}
