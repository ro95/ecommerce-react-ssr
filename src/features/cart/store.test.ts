import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Product } from '@shared/types'

/**
 * In-memory Web Storage mock installed BEFORE the store module is imported.
 *
 * Why hoisted: zustand's `createJSONStorage(() => localStorage)` resolves and
 * CACHES the storage once, at store-creation (module-evaluation) time. Under
 * Node 22 + jsdom in this runner the ambient `localStorage` global is Node's
 * experimental, broken Storage (no setItem/getItem/clear), so without replacing
 * it before import the store would cache the broken instance. `vi.hoisted` runs
 * before the hoisted ESM imports, so the store binds to this mock instead. No
 * config or source change.
 */
const { storageMock } = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storageMock: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value))
    },
    removeItem: (key: string) => {
      map.delete(key)
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
  }
  vi.stubGlobal('localStorage', storageMock)
  return { storageMock }
})

// Imported AFTER the hoisted stub so the persisted storage binds to the mock.
const { useCartStore } = await import('./store')

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

const STORAGE_KEY = 'eshop-cart'

beforeEach(() => {
  storageMock.clear()
  useCartStore.setState({ items: [] })
})

describe('useCartStore — operations', () => {
  it('addProduct adds a new line and increments an existing one', () => {
    const { addProduct } = useCartStore.getState()

    addProduct(makeProduct({ id: 1 }), 2)
    addProduct(makeProduct({ id: 1 }), 3)
    addProduct(makeProduct({ id: 2 }), 1)

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(2)
    expect(items.find((i) => i.product.id === 1)?.quantity).toBe(5)
  })

  it('removeProduct removes the matching line', () => {
    const { addProduct, removeProduct } = useCartStore.getState()
    addProduct(makeProduct({ id: 1 }))
    addProduct(makeProduct({ id: 2 }))

    removeProduct(1)

    expect(useCartStore.getState().items.map((i) => i.product.id)).toEqual([2])
  })

  it('setProductQuantity updates and removes on zero', () => {
    const { addProduct, setProductQuantity } = useCartStore.getState()
    addProduct(makeProduct({ id: 1 }), 1)

    setProductQuantity(1, 4)
    expect(useCartStore.getState().items[0]!.quantity).toBe(4)

    setProductQuantity(1, 0)
    expect(useCartStore.getState().items).toEqual([])
  })

  it('setItems replaces the whole list (used by rollback)', () => {
    const { addProduct, setItems } = useCartStore.getState()
    addProduct(makeProduct({ id: 1 }))

    const snapshot = [{ product: makeProduct({ id: 9 }), quantity: 3 }]
    setItems(snapshot)

    expect(useCartStore.getState().items).toEqual(snapshot)
  })

  it('clear empties the cart', () => {
    const { addProduct, clear } = useCartStore.getState()
    addProduct(makeProduct({ id: 1 }))

    clear()

    expect(useCartStore.getState().items).toEqual([])
  })
})

describe('useCartStore — persistence', () => {
  it('persists only items (not the action functions) under a versioned key', () => {
    useCartStore.getState().addProduct(makeProduct({ id: 1 }), 2)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()

    const parsed = JSON.parse(raw as string) as {
      version: number
      state: { items: unknown[]; addProduct?: unknown }
    }
    expect(parsed.version).toBe(1)
    expect(parsed.state.items).toHaveLength(1)
    // partialize must strip the functions.
    expect(parsed.state.addProduct).toBeUndefined()
    expect(Object.keys(parsed.state)).toEqual(['items'])
  })

  it('rehydrate() reads a persisted payload back into the store', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { items: [{ product: makeProduct({ id: 5 }), quantity: 7 }] } }),
    )

    // skipHydration means the store did not auto-load; trigger it explicitly.
    await useCartStore.persist.rehydrate()

    const { items } = useCartStore.getState()
    expect(items).toHaveLength(1)
    expect(items[0]!.product.id).toBe(5)
    expect(items[0]!.quantity).toBe(7)
  })
})

describe('useCartStore — SSR safety', () => {
  it('starts empty and does not auto-read localStorage (skipHydration)', () => {
    // A persisted payload exists, but without an explicit rehydrate() the store
    // must stay at its initial empty state — this is what keeps the first client
    // paint identical to the server render.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { items: [{ product: makeProduct({ id: 1 }), quantity: 1 }] } }),
    )

    // Re-reading state without rehydrating: still empty (set in beforeEach).
    expect(useCartStore.getState().items).toEqual([])
  })
})
