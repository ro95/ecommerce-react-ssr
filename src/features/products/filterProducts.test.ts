import { describe, it, expect } from 'vitest'
import type { Product } from '@shared/types'
import {
  filterProducts,
  deriveCategories,
  EMPTY_FILTER_CRITERIA,
} from './filterProducts'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Plain T-Shirt',
    price: 19.99,
    description: 'A shirt.',
    category: "men's clothing",
    image: 'https://example.com/img.jpg',
    rating: { rate: 4, count: 10 },
    ...overrides,
  }
}

const catalog: Product[] = [
  makeProduct({ id: 1, title: 'Blue Cotton Shirt', category: "men's clothing" }),
  makeProduct({ id: 2, title: 'Gold Necklace', category: 'jewelery' }),
  makeProduct({ id: 3, title: 'Womens Short Sleeve Shirt', category: "women's clothing" }),
  makeProduct({ id: 4, title: 'SSD Hard Drive', category: 'electronics' }),
]

describe('filterProducts — pure title/category filtering', () => {
  it('returns every product unchanged for empty criteria', () => {
    expect(filterProducts(catalog, EMPTY_FILTER_CRITERIA)).toEqual(catalog)
  })

  it('filters by title, case-insensitively', () => {
    const result = filterProducts(catalog, { query: 'SHIRT', categories: [] })
    expect(result.map((p) => p.id)).toEqual([1, 3])
  })

  it('trims whitespace-only queries to "match all"', () => {
    expect(filterProducts(catalog, { query: '   ', categories: [] })).toEqual(catalog)
  })

  it('filters by a single category', () => {
    const result = filterProducts(catalog, { query: '', categories: ['jewelery'] })
    expect(result.map((p) => p.id)).toEqual([2])
  })

  it('filters by multiple categories (OR within the dimension)', () => {
    const result = filterProducts(catalog, {
      query: '',
      categories: ['jewelery', 'electronics'],
    })
    expect(result.map((p) => p.id)).toEqual([2, 4])
  })

  it('combines title and category (AND across dimensions)', () => {
    const result = filterProducts(catalog, {
      query: 'shirt',
      categories: ["women's clothing"],
    })
    expect(result.map((p) => p.id)).toEqual([3])
  })

  it('returns an empty list when nothing matches', () => {
    expect(filterProducts(catalog, { query: 'nonexistent', categories: [] })).toEqual([])
  })

  it('preserves the input order', () => {
    const result = filterProducts(catalog, { query: '', categories: [] })
    expect(result.map((p) => p.id)).toEqual([1, 2, 3, 4])
  })
})

describe('deriveCategories', () => {
  it('returns unique categories sorted alphabetically', () => {
    expect(deriveCategories(catalog)).toEqual([
      'electronics',
      'jewelery',
      "men's clothing",
      "women's clothing",
    ])
  })

  it('returns an empty list for no products', () => {
    expect(deriveCategories([])).toEqual([])
  })
})
