/**
 * Integration tests for the BFF router (supertest against a real Express app).
 *
 * The router's cache is a module-level singleton, so each test gets a FRESH
 * module graph via `vi.resetModules()` + dynamic import. That isolates the cache
 * between cases and lets us mock `./fakestore-client.ts` (the network boundary)
 * per test. No real request ever reaches FakeStore.
 *
 * Focus: the frontiers from CLAUDE.md §4 — API unavailable → graceful JSON error
 * (no crash, no stack leak), upstream validation surfaced cleanly, and the route
 * contract (shape, status codes, cart validation). Cache TTL/SWR/coalescing are
 * unit-tested on the class in cache.test.ts; here we assert the HTTP wiring
 * (X-Cache / Cache-Control headers reflect the cache state).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import express from 'express'
import type { Express } from 'express'
import request from 'supertest'
import type { Product } from '../../shared/types.ts'

const VALID_PRODUCT: Product = {
  id: 1,
  title: 'Test product',
  price: 9.99,
  description: 'A product',
  category: 'misc',
  image: 'https://example.com/p.png',
  rating: { rate: 4.2, count: 10 },
}

/**
 * Build a fresh Express app with a fresh BFF router (and thus a fresh cache),
 * after registering mocks for the network boundary. Returns the app plus the
 * mocked client fns so tests can drive upstream behaviour.
 */
type UpstreamErrorCtor = typeof import('./upstream-error.ts').UpstreamError

/**
 * Client mocks are provided as BUILDERS that receive the `UpstreamError` ctor
 * resolved from the post-reset module graph. This guarantees any UpstreamError a
 * test throws is the SAME class the router imports, so `error instanceof
 * UpstreamError` in sendError holds (it wouldn't with a separately-imported copy
 * after `vi.resetModules()`).
 */
async function buildApp(clientMock: {
  fetchProducts?: (UE: UpstreamErrorCtor) => () => Promise<Product[]>
  fetchProductById?: (UE: UpstreamErrorCtor) => (id: number) => Promise<Product>
}): Promise<{ app: Express; fetchProducts: ReturnType<typeof vi.fn> }> {
  vi.resetModules()

  // Import UpstreamError first so builders capture the post-reset class.
  const { UpstreamError } = await import('./upstream-error.ts')

  const fetchProducts = vi.fn(
    clientMock.fetchProducts?.(UpstreamError) ?? (() => Promise.resolve([VALID_PRODUCT])),
  )
  const fetchProductById = vi.fn(
    clientMock.fetchProductById?.(UpstreamError) ??
      (() => Promise.resolve(VALID_PRODUCT)),
  )

  vi.doMock('./fakestore-client.ts', () => ({ fetchProducts, fetchProductById }))

  const { createBffRouter } = await import('./router.ts')
  const app = express()
  app.use(express.json())
  app.use('/api', createBffRouter())
  return { app, fetchProducts }
}

describe('BFF router', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  describe('GET /api/products', () => {
    it('returns 200 with { products } and cache headers', async () => {
      const { app } = await buildApp({})

      const res = await request(app).get('/api/products')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ products: [VALID_PRODUCT] })
      expect(res.headers['x-cache']).toBe('miss')
      expect(res.headers['cache-control']).toContain('max-age=')
    })

    it('serves the second request from cache (X-Cache: fresh, one upstream call)', async () => {
      const { app, fetchProducts } = await buildApp({})

      const first = await request(app).get('/api/products')
      const second = await request(app).get('/api/products')

      expect(first.headers['x-cache']).toBe('miss')
      expect(second.headers['x-cache']).toBe('fresh')
      expect(fetchProducts).toHaveBeenCalledOnce()
    })
  })

  describe('API unavailable → graceful degradation (CRITICAL)', () => {
    it('returns a clean JSON 502 when the upstream is unreachable, no crash, no stack leak', async () => {
      const { app } = await buildApp({
        fetchProducts: (UE) => () =>
          Promise.reject(
            new UE('bad_gateway', 'Upstream request failed: /products', {
              cause: new TypeError('fetch failed'),
            }),
          ),
      })

      const res = await request(app).get('/api/products')

      expect(res.status).toBe(502)
      expect(res.body).toEqual({
        error: 'bad_gateway',
        message: 'Upstream service unavailable',
      })
      // No internals leaked: no stack, no upstream message, no cause.
      const serialized = JSON.stringify(res.body)
      expect(serialized).not.toContain('fetch failed')
      expect(serialized).not.toMatch(/at \w|\.ts:|stack/i)
      expect(res.body).not.toHaveProperty('stack')
    })

    it('returns 504 on an upstream timeout', async () => {
      const { app } = await buildApp({
        fetchProducts: (UE) => () =>
          Promise.reject(new UE('timeout', 'Upstream timed out: /products')),
      })

      const res = await request(app).get('/api/products')

      expect(res.status).toBe(504)
      expect(res.body).toEqual({ error: 'timeout', message: 'Upstream timed out' })
    })

    it('does not crash the process on an unexpected (non-UpstreamError) throw → opaque 500', async () => {
      const { app } = await buildApp({
        fetchProducts: () => () => Promise.reject(new Error('boom: internal detail')),
      })

      const res = await request(app).get('/api/products')

      expect(res.status).toBe(500)
      expect(res.body).toEqual({
        error: 'internal_error',
        message: 'Internal Server Error',
      })
      expect(JSON.stringify(res.body)).not.toContain('boom: internal detail')
    })
  })

  describe('Zod upstream validation surfaced cleanly', () => {
    it('maps an invalid_payload upstream error to a 502 without echoing details', async () => {
      const { app } = await buildApp({
        fetchProducts: (UE) => () =>
          Promise.reject(
            new UE('invalid_payload', 'Upstream payload failed validation', {
              cause: { issues: [{ path: ['0', 'price'], message: 'expected number' }] },
            }),
          ),
      })

      const res = await request(app).get('/api/products')

      const body = res.body as { error: string; message: string }
      expect(res.status).toBe(502)
      expect(body.error).toBe('invalid_payload')
      expect(body.message).toBe('Upstream service unavailable')
      expect(JSON.stringify(res.body)).not.toContain('expected number')
    })
  })

  describe('GET /api/products/:id', () => {
    it('returns 200 with the product for a valid id', async () => {
      const { app } = await buildApp({})
      const res = await request(app).get('/api/products/1')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(VALID_PRODUCT)
      expect(res.headers['x-cache']).toBe('miss')
    })

    it('returns 404 (clean JSON) for a not_found upstream (empty-body quirk)', async () => {
      const { app } = await buildApp({
        fetchProductById: (UE) => () =>
          Promise.reject(new UE('not_found', 'Product 9999 not found')),
      })

      const res = await request(app).get('/api/products/9999')

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'not_found', message: 'Resource not found' })
    })

    it('returns 400 for a non-integer id (input validation at the frontier)', async () => {
      const { app } = await buildApp({})
      const res = await request(app).get('/api/products/abc')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'bad_request', message: 'Invalid product id' })
    })

    it('returns 400 for a non-positive id', async () => {
      const { app } = await buildApp({})
      const res = await request(app).get('/api/products/0')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/cart', () => {
    it('returns 201 with a normalized envelope for a valid cart', async () => {
      const { app } = await buildApp({})
      const res = await request(app)
        .post('/api/cart')
        .send({ items: [{ productId: 1, quantity: 2 }, { productId: 5, quantity: 3 }] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        ok: true,
        items: [
          { productId: 1, quantity: 2 },
          { productId: 5, quantity: 3 },
        ],
        totalQuantity: 5,
      })
      expect(res.headers['cache-control']).toBe('no-store')
    })

    it('returns 400 with field-level issues for an invalid cart (schema)', async () => {
      const { app } = await buildApp({})
      const res = await request(app)
        .post('/api/cart')
        .send({ items: [{ productId: -1, quantity: 0 }] })

      const body = res.body as { error: string; issues: unknown[] }
      expect(res.status).toBe(400)
      expect(body.error).toBe('bad_request')
      expect(Array.isArray(body.issues)).toBe(true)
      expect(body.issues.length).toBeGreaterThan(0)
    })

    it('returns 400 for an empty items array (min 1)', async () => {
      const { app } = await buildApp({})
      const res = await request(app).post('/api/cart').send({ items: [] })
      expect(res.status).toBe(400)
    })

    it('returns 400 for a malformed JSON body without crashing', async () => {
      const { app } = await buildApp({})
      const res = await request(app)
        .post('/api/cart')
        .set('Content-Type', 'application/json')
        .send('{ not valid json ')

      // express.json() rejects the body before the handler; a clean 400, no crash.
      expect(res.status).toBe(400)
    })
  })
})
