import { assign, fromPromise, setup } from 'xstate'
import type { CartItem, Product } from '@shared/types'
import { addItem, removeItem, setQuantity } from './cartItems'
import { syncCart } from './api'

/**
 * A single cart mutation, expressed declaratively so the machine can both apply
 * it optimistically and re-derive the next item list purely (no hidden state).
 */
export type CartMutation =
  | { type: 'add'; product: Product; quantity?: number }
  | { type: 'remove'; productId: number }
  | { type: 'setQuantity'; productId: number; quantity: number }

/** Pure application of a mutation to a list — the heart of optimistic update. */
export function applyMutation(items: CartItem[], mutation: CartMutation): CartItem[] {
  switch (mutation.type) {
    case 'add':
      return addItem(items, mutation.product, mutation.quantity)
    case 'remove':
      return removeItem(items, mutation.productId)
    case 'setQuantity':
      return setQuantity(items, mutation.productId, mutation.quantity)
  }
}

export interface CartMachineContext {
  /** Live cart items (mirror of the store, kept in sync via `onItemsCommit`). */
  items: CartItem[]
  /** Pre-mutation snapshot, captured to enable rollback on sync failure. */
  snapshot: CartItem[]
  /** Last sync error message, surfaced to the UI in the `failure` state. */
  error: string | null
}

export type CartMachineEvent =
  | { type: 'MUTATE'; mutation: CartMutation }
  | { type: 'RETRY' }
  | { type: 'DISMISS' }

/**
 * Optimistic-update machine.
 *
 * States:
 *  - idle      : nothing in flight. On MUTATE → snapshot current items, compute
 *                + commit the optimistic next items, go to `syncing`.
 *  - syncing   : server sync invoked. onDone → idle (success). onError → failure.
 *  - failure   : sync rejected. The `rollback` action restored the snapshot in
 *                the store; UI can show an error and offer RETRY / DISMISS.
 *
 * The machine owns orchestration only; it never touches localStorage. The
 * actual store writes happen through the injected `commitItems` action provided
 * by the React layer, which keeps the store the single source of truth.
 */
export const cartMachine = setup({
  types: {
    context: {} as CartMachineContext,
    events: {} as CartMachineEvent,
    input: {} as { items: CartItem[] },
  },
  actors: {
    syncCart: fromPromise<void, { items: CartItem[] }>(({ input }) =>
      syncCart(input.items),
    ),
  },
  actions: {
    /**
     * Bridge to the store. Overridden via `.provide()` in the React hook so the
     * machine stays decoupled from Zustand and remains unit-testable in
     * isolation. Default is a no-op (pure-machine tests don't need a store).
     */
    commitItems: (_, _params: { items: CartItem[] }) => {
      /* provided by the React layer */
    },
  },
}).createMachine({
  id: 'cart',
  context: ({ input }) => ({
    items: input.items,
    snapshot: input.items,
    error: null,
  }),
  initial: 'idle',
  // A MUTATE is accepted in every state so the UI never blocks: rapid clicks
  // (or a click while a previous sync is in flight) re-snapshot, commit the new
  // optimistic items, and (re)enter `syncing`. The snapshot captured is the
  // last successfully-committed items, so a later failure rolls back coherently.
  on: {
    MUTATE: {
      target: '.syncing',
      actions: [
        assign({
          snapshot: ({ context }) => context.items,
          items: ({ context, event }) => applyMutation(context.items, event.mutation),
          error: null,
        }),
        // Commit the items the preceding `assign` already computed. Re-deriving
        // with applyMutation here would apply the mutation twice (the assign has
        // updated context.items by the time these params are read in XState v5).
        {
          type: 'commitItems',
          params: ({ context }) => ({ items: context.items }),
        },
      ],
    },
  },
  states: {
    idle: {},
    syncing: {
      invoke: {
        src: 'syncCart',
        input: ({ context }) => ({ items: context.items }),
        onDone: { target: 'idle' },
        onError: {
          target: 'failure',
          actions: [
            assign({
              items: ({ context }) => context.snapshot,
              error: ({ event }) =>
                event.error instanceof Error ? event.error.message : 'Cart sync failed',
            }),
            // Roll the store back to the snapshot taken before the mutation.
            {
              type: 'commitItems',
              params: ({ context }) => ({ items: context.snapshot }),
            },
          ],
        },
      },
    },
    failure: {
      on: {
        RETRY: {
          target: 'syncing',
          actions: assign({ error: null }),
        },
        DISMISS: { target: 'idle', actions: assign({ error: null }) },
      },
    },
  },
})
