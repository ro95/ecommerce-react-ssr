import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createActor, fromPromise } from 'xstate'
import type { Actor } from 'xstate'
import type { CartItem, Product } from '@shared/types'
import { cartMachine, applyMutation } from './cartMachine'
import type { CartMutation } from './cartMachine'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Backpack',
    price: 10,
    description: '',
    category: 'misc',
    image: 'https://example.com/img.jpg',
    rating: { rate: 4, count: 10 },
    ...overrides,
  }
}

/**
 * Build an actor with the network actor and store bridge stubbed.
 *
 * - `sync`     : the promise the machine awaits in `syncing`. Resolve → success,
 *                reject → rollback path.
 * - `commits`  : every items list the machine asks the store to commit, in order.
 *                The optimistic write is the first commit; a rollback appends the
 *                snapshot as a later commit.
 */
function buildActor(
  initialItems: CartItem[],
  sync: () => Promise<void>,
): { actor: Actor<typeof cartMachine>; commits: CartItem[][] } {
  const commits: CartItem[][] = []

  const machine = cartMachine.provide({
    actors: {
      syncCart: fromPromise<void, { items: CartItem[] }>(() => sync()),
    },
    actions: {
      commitItems: (_, params: { items: CartItem[] }) => {
        commits.push(params.items)
      },
    },
  })

  const actor = createActor(machine, { input: { items: initialItems } })
  return { actor, commits }
}

const addBackpack: CartMutation = { type: 'add', product: makeProduct({ id: 1 }) }

describe('applyMutation (pure)', () => {
  it('dispatches add to addItem (quantity defaults to 1 when omitted)', () => {
    expect(applyMutation([], addBackpack)).toEqual([
      { product: makeProduct({ id: 1 }), quantity: 1 },
    ])
  })

  it('dispatches remove to removeItem', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]
    expect(applyMutation(items, { type: 'remove', productId: 1 })).toEqual([])
  })

  it('dispatches setQuantity to setQuantity', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]
    expect(applyMutation(items, { type: 'setQuantity', productId: 1, quantity: 9 })).toEqual([
      { product: makeProduct({ id: 1 }), quantity: 9 },
    ])
  })
})

describe('cartMachine — happy path', () => {
  it('applies the optimistic items, syncs, and lands back in idle', async () => {
    const { actor, commits } = buildActor([], () => Promise.resolve())
    actor.start()

    actor.send({ type: 'MUTATE', mutation: addBackpack })

    // Optimistic commit happened synchronously on the MUTATE transition.
    expect(commits).toHaveLength(1)
    expect(commits[0]!.map((i) => i.product.id)).toEqual([1])
    expect(actor.getSnapshot().value).toBe('syncing')

    // Context (the source the store ultimately mirrors via the rollback path)
    // holds the correct single-add quantity.
    expect(actor.getSnapshot().context.items).toEqual([
      { product: makeProduct({ id: 1 }), quantity: 1 },
    ])

    // Let the resolved sync promise settle.
    await vi.waitFor(() => expect(actor.getSnapshot().value).toBe('idle'))

    expect(actor.getSnapshot().context.error).toBeNull()
    // No rollback commit appended.
    expect(commits).toHaveLength(1)
  })

  // Regression guard: the optimistic commit must hand the store EXACTLY the
  // items computed by the preceding `assign` — not re-derive them (which would
  // apply a non-idempotent `add` twice). Context and store must agree.
  it('commits the optimistic items once: context and store stay in sync', () => {
    const { actor, commits } = buildActor([], () => Promise.resolve())
    actor.start()

    actor.send({ type: 'MUTATE', mutation: makeAdd(1) })

    expect(actor.getSnapshot().context.items[0]!.quantity).toBe(1)
    // The value pushed to the store matches the machine context (no double-apply).
    expect(commits[0]![0]!.quantity).toBe(1)
  })
})

describe('cartMachine — rollback on sync failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ADD: rolls the store back to the pre-mutation snapshot and enters failure', async () => {
    const initial: CartItem[] = [{ product: makeProduct({ id: 2 }), quantity: 1 }]
    const { actor, commits } = buildActor(
      initial,
      () =>
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('network down')), 300),
        ),
    )
    actor.start()

    actor.send({ type: 'MUTATE', mutation: makeAdd(1) })

    // Optimistic state applied: snapshot is the pre-mutation list, items has the new line.
    const syncing = actor.getSnapshot()
    expect(syncing.value).toBe('syncing')
    expect(syncing.context.snapshot).toEqual(initial)
    expect(syncing.context.items.map((i) => i.product.id)).toEqual([2, 1])
    expect(commits[0]!.map((i) => i.product.id)).toEqual([2, 1]) // optimistic commit

    // Drive the simulated network latency, then flush the rejection.
    await vi.advanceTimersByTimeAsync(300)

    const failed = actor.getSnapshot()
    expect(failed.value).toBe('failure')
    expect(failed.context.error).toBe('network down')
    // Machine context restored to snapshot...
    expect(failed.context.items).toEqual(initial)
    // ...and the store was told to roll back (second commit === snapshot).
    expect(commits).toHaveLength(2)
    expect(commits[1]).toEqual(initial)
  })

  it('REMOVE: a failed remove restores the removed line', async () => {
    const initial: CartItem[] = [
      { product: makeProduct({ id: 1 }), quantity: 2 },
      { product: makeProduct({ id: 2 }), quantity: 1 },
    ]
    const { actor, commits } = buildActor(
      initial,
      () => new Promise((_r, reject) => setTimeout(() => reject(new Error('boom')), 50)),
    )
    actor.start()

    actor.send({ type: 'MUTATE', mutation: { type: 'remove', productId: 1 } })

    expect(actor.getSnapshot().context.items.map((i) => i.product.id)).toEqual([2])

    await vi.advanceTimersByTimeAsync(50)

    expect(actor.getSnapshot().value).toBe('failure')
    expect(actor.getSnapshot().context.items).toEqual(initial)
    expect(commits.at(-1)).toEqual(initial)
  })

  it('SET_QUANTITY: a failed quantity change restores the previous quantity', async () => {
    const initial: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]
    const { actor, commits } = buildActor(
      initial,
      () => new Promise((_r, reject) => setTimeout(() => reject(new Error('nope')), 50)),
    )
    actor.start()

    actor.send({ type: 'MUTATE', mutation: { type: 'setQuantity', productId: 1, quantity: 9 } })

    expect(actor.getSnapshot().context.items[0]!.quantity).toBe(9)

    await vi.advanceTimersByTimeAsync(50)

    expect(actor.getSnapshot().value).toBe('failure')
    expect(actor.getSnapshot().context.items[0]!.quantity).toBe(2)
    expect(commits.at(-1)).toEqual(initial)
  })

  it('falls back to a generic message when the rejection is not an Error', async () => {
    const { actor } = buildActor(
      [],
      () =>
        // Intentionally a non-Error rejection to exercise the machine's fallback.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        new Promise((_r, reject) => setTimeout(() => reject('plain string'), 10)),
    )
    actor.start()
    actor.send({ type: 'MUTATE', mutation: makeAdd(1) })

    await vi.advanceTimersByTimeAsync(10)

    expect(actor.getSnapshot().context.error).toBe('Cart sync failed')
  })
})

describe('cartMachine — recovery from failure', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('RETRY from failure re-enters syncing and can succeed, clearing the error', async () => {
    let attempt = 0
    const { actor } = buildActor([], () => {
      attempt += 1
      return attempt === 1
        ? new Promise((_r, reject) => setTimeout(() => reject(new Error('first fails')), 20))
        : Promise.resolve()
    })
    actor.start()

    actor.send({ type: 'MUTATE', mutation: makeAdd(1) })
    await vi.advanceTimersByTimeAsync(20)
    expect(actor.getSnapshot().value).toBe('failure')

    actor.send({ type: 'RETRY' })
    expect(actor.getSnapshot().context.error).toBeNull()
    await vi.waitFor(() => expect(actor.getSnapshot().value).toBe('idle'))
  })

  it('DISMISS from failure returns to idle and clears the error', async () => {
    const { actor } = buildActor(
      [],
      () => new Promise((_r, reject) => setTimeout(() => reject(new Error('x')), 10)),
    )
    actor.start()
    actor.send({ type: 'MUTATE', mutation: makeAdd(1) })
    await vi.advanceTimersByTimeAsync(10)
    expect(actor.getSnapshot().value).toBe('failure')

    actor.send({ type: 'DISMISS' })

    expect(actor.getSnapshot().value).toBe('idle')
    expect(actor.getSnapshot().context.error).toBeNull()
  })
})

function makeAdd(id: number): CartMutation {
  return { type: 'add', product: makeProduct({ id }), quantity: 1 }
}
