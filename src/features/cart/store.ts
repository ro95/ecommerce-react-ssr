import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartItem, Product } from '@shared/types'
import { addItem, removeItem, setQuantity } from './cartItems'

/**
 * Persisted schema version. Bump when the shape of `items` changes so the
 * `migrate` hook can transform (or discard) stale localStorage payloads instead
 * of letting an incompatible shape crash hydration.
 */
const CART_PERSIST_VERSION = 1
const CART_STORAGE_KEY = 'eshop-cart'

interface CartState {
  items: CartItem[]
  /**
   * Commit helpers. These mutate state synchronously and optimistically; the
   * async server sync + rollback lives in the XState machine, which calls
   * `setItems` to roll back to a snapshot on failure.
   */
  addProduct: (product: Product, quantity?: number) => void
  removeProduct: (productId: Product['id']) => void
  setProductQuantity: (productId: Product['id'], quantity: number) => void
  /** Replace the whole item list — used by the optimistic-update rollback. */
  setItems: (items: CartItem[]) => void
  clear: () => void
}

/**
 * SSR-safety: `skipHydration: true` means the persist middleware does NOT read
 * localStorage automatically. On the server there is no localStorage, and on
 * the client we rehydrate explicitly AFTER React hydration (see
 * `useHydrateCart`). This guarantees:
 *  - the server render and the first client render both start from `items: []`
 *    → no markup mismatch driven by a persisted cart,
 *  - the persisted cart is applied a tick later, client-only (an accepted,
 *    documented post-hydration update).
 *
 * `createJSONStorage(() => localStorage)` is only ever invoked in the browser
 * because we call `rehydrate()`/persist exclusively client-side.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addProduct: (product, quantity = 1) =>
        set({ items: addItem(get().items, product, quantity) }),
      removeProduct: (productId) => set({ items: removeItem(get().items, productId) }),
      setProductQuantity: (productId, quantity) =>
        set({ items: setQuantity(get().items, productId, quantity) }),
      setItems: (items) => set({ items }),
      clear: () => set({ items: [] }),
    }),
    {
      name: CART_STORAGE_KEY,
      version: CART_PERSIST_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Only persist the data, never the action functions.
      partialize: (state) => ({ items: state.items }),
      skipHydration: true,
    },
  ),
)
