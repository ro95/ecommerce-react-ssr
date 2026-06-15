import { describe, it, expect } from 'vitest'
import type { CartItem, Product } from '@shared/types'
import { computeTotals } from './totals'

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

describe('computeTotals', () => {
  it('returns zeroed totals for an empty cart', () => {
    expect(computeTotals([])).toEqual({ itemCount: 0, subtotal: 0 })
  })

  it('sums quantities into itemCount and price*quantity into subtotal', () => {
    const items: CartItem[] = [
      { product: makeProduct({ id: 1, price: 10 }), quantity: 2 },
      { product: makeProduct({ id: 2, price: 5 }), quantity: 3 },
    ]

    expect(computeTotals(items)).toEqual({ itemCount: 5, subtotal: 35 })
  })

  it('handles fractional prices (FakeStore-style)', () => {
    const items: CartItem[] = [
      { product: makeProduct({ id: 1, price: 109.95 }), quantity: 1 },
      { product: makeProduct({ id: 2, price: 22.3 }), quantity: 2 },
    ]

    const { itemCount, subtotal } = computeTotals(items)

    expect(itemCount).toBe(3)
    expect(subtotal).toBeCloseTo(154.55, 2)
  })

  it('treats a zero-price product as contributing to count but not subtotal', () => {
    const items: CartItem[] = [
      { product: makeProduct({ id: 1, price: 0 }), quantity: 4 },
    ]

    expect(computeTotals(items)).toEqual({ itemCount: 4, subtotal: 0 })
  })
})
