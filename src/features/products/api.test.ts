import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Product } from '@shared/types'
import { fetchProducts } from './api'

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

function mockFetchOnce(init: { ok: boolean; status?: number; json?: unknown }): void {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    statusText: init.ok ? 'OK' : 'Error',
    json: () => Promise.resolve(init.json),
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchProducts', () => {
  it('hits the BFF products endpoint with the given base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ products: [makeProduct()] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchProducts('http://localhost:5173')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5173/api/products')
  })

  it('accepts and returns a valid product payload', async () => {
    const product = makeProduct({ id: 7, title: 'Valid' })
    mockFetchOnce({ ok: true, json: { products: [product] } })

    const result = await fetchProducts('')

    expect(result.products).toEqual([product])
  })

  it('throws when the response is not ok (BFF / network failure)', async () => {
    mockFetchOnce({ ok: false, status: 503 })

    await expect(fetchProducts('')).rejects.toThrow(/Failed to fetch products: 503/)
  })

  it('rejects a payload whose product violates the Zod schema (negative price)', async () => {
    const bad = { ...makeProduct(), price: -5 }
    mockFetchOnce({ ok: true, json: { products: [bad] } })

    await expect(fetchProducts('')).rejects.toThrowError()
  })

  it('rejects a payload with a missing required field (no title)', async () => {
    const withoutTitle: Partial<Product> = makeProduct()
    delete withoutTitle.title
    mockFetchOnce({ ok: true, json: { products: [withoutTitle] } })

    await expect(fetchProducts('')).rejects.toThrowError()
  })

  it('rejects a non-URL image (schema is z.string().url())', async () => {
    const bad = { ...makeProduct(), image: 'not-a-url' }
    mockFetchOnce({ ok: true, json: { products: [bad] } })

    await expect(fetchProducts('')).rejects.toThrowError()
  })

  it('rejects when `products` is absent from the envelope', async () => {
    mockFetchOnce({ ok: true, json: { items: [] } })

    await expect(fetchProducts('')).rejects.toThrowError()
  })

  it('rejects a rating outside the allowed range (rate > 5)', async () => {
    const bad = makeProduct({ rating: { rate: 9, count: 1 } })
    mockFetchOnce({ ok: true, json: { products: [bad] } })

    await expect(fetchProducts('')).rejects.toThrowError()
  })
})
