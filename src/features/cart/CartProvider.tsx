import { createContext, use, type ReactNode } from 'react'
import { useActorRef } from '@xstate/react'
import type { ActorRefFrom } from 'xstate'
import type { CartItem } from '@shared/types'
import { cartMachine } from './cartMachine'
import { useCartStore } from './store'

/**
 * The cart machine, wired ONCE to the store bridge. Defined at module scope (it
 * only references the module-singleton store via getState), so the actor logic
 * identity is stable across renders.
 */
const cartMachineWithStore = cartMachine.provide({
  actions: {
    commitItems: (_, params: { items: CartItem[] }) => {
      useCartStore.getState().setItems(params.items)
    },
  },
})

type CartActorRef = ActorRefFrom<typeof cartMachine>

const CartActorContext = createContext<CartActorRef | null>(null)

/**
 * Provides a SINGLE cart machine for the whole app.
 *
 * Why one shared machine (not one per `useCart` call): the optimistic-sync
 * status (`isSyncing` / `error`) must be coherent app-wide. With a machine per
 * component, an add-to-cart failure on the PLP would update only that card's
 * machine — invisible everywhere else (silent rollback). One machine = one
 * source of sync truth, surfaced globally (see CartSyncStatus).
 *
 * SSR-safe: `useActorRef` creates the actor per render tree, i.e. per request on
 * the server — never a cross-request singleton. Initial state (idle, no error)
 * is identical on server and client, so there is no hydration mismatch.
 */
export function CartProvider({ children }: { children: ReactNode }): ReactNode {
  // Initial items are empty; every mutation rebases on the live store (baseItems),
  // so this seed is never the source of truth — it only satisfies the machine input.
  const actorRef = useActorRef(cartMachineWithStore, { input: { items: [] } })
  return <CartActorContext.Provider value={actorRef}>{children}</CartActorContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook colocated with its provider
export function useCartActor(): CartActorRef {
  const actorRef = use(CartActorContext)
  if (!actorRef) {
    throw new Error('useCart must be used within <CartProvider>')
  }
  return actorRef
}
