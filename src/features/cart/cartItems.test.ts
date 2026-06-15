import { describe, it, expect } from 'vitest'
import type { CartItem, Product } from '@shared/types'
import { addItem, removeItem, setQuantity } from './cartItems'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Backpack',
    price: 109.95,
    description: 'A backpack.',
    category: "men's clothing",
    image: 'https://example.com/img.jpg',
    rating: { rate: 3.9, count: 120 },
    ...overrides,
  }
}

describe('addItem', () => {
  it('appends a new line when the product is absent', () => {
    const product = makeProduct({ id: 2 })

    const result = addItem([], product, 3)

    expect(result).toEqual([{ product, quantity: 3 }])
  })

  it('defaults quantity to 1 when omitted', () => {
    const result = addItem([], makeProduct())

    expect(result[0]!.quantity).toBe(1)
  })

  it('increments the quantity of an existing line instead of duplicating it', () => {
    const existing: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]

    const result = addItem(existing, makeProduct({ id: 1 }), 3)

    expect(result).toHaveLength(1)
    expect(result[0]!.quantity).toBe(5)
  })

  it('does not mutate the input array (returns a new reference)', () => {
    const input: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 1 }]

    const result = addItem(input, makeProduct({ id: 2 }))

    expect(result).not.toBe(input)
    expect(input).toHaveLength(1)
  })
})

describe('removeItem', () => {
  it('removes the matching line', () => {
    const items: CartItem[] = [
      { product: makeProduct({ id: 1 }), quantity: 1 },
      { product: makeProduct({ id: 2 }), quantity: 1 },
    ]

    const result = removeItem(items, 1)

    expect(result.map((i) => i.product.id)).toEqual([2])
  })

  it('is a no-op when the product id is not in the cart', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 1 }]

    const result = removeItem(items, 999)

    expect(result).toEqual(items)
  })

  it('returns an empty array when removing from an empty cart', () => {
    expect(removeItem([], 1)).toEqual([])
  })
})

describe('setQuantity', () => {
  it('sets an absolute quantity on an existing line', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]

    const result = setQuantity(items, 1, 7)

    expect(result[0]!.quantity).toBe(7)
  })

  it('removes the line when quantity is 0', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]

    const result = setQuantity(items, 1, 0)

    expect(result).toEqual([])
  })

  it('removes the line when quantity is negative', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]

    const result = setQuantity(items, 1, -5)

    expect(result).toEqual([])
  })

  it('is a no-op for a non-existent product id', () => {
    const items: CartItem[] = [{ product: makeProduct({ id: 1 }), quantity: 2 }]

    const result = setQuantity(items, 999, 4)

    expect(result).toEqual(items)
  })
})
