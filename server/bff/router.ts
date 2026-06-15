/**
 * BFF router — mounted on `/api`, BEFORE the SSR catch-all.
 *
 * Each handler is a thin controller: validate input → delegate to the client
 * (through the cache) → shape the HTTP response. No business logic, no network
 * code here. Errors never crash the process and never leak a stack trace:
 *  - expected upstream failures become a clean JSON 404/502/504,
 *  - malformed client input becomes a 400,
 *  - anything unexpected becomes a generic 500 (no internals echoed).
 *
 * Cache-Control is derived from the cache state so downstream caches/CDNs and
 * the browser get a coherent freshness signal that mirrors the BFF's own TTL.
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import type { Product, ProductsResponse } from '../../shared/types.ts'
import { fetchProducts, fetchProductById } from './fakestore-client.ts'
import { TtlSwrCache } from './cache.ts'
import type { CacheState } from './cache.ts'
import { CACHE_TTL_MS, CACHE_STALE_TTL_MS } from './config.ts'
import { CartInputSchema } from './cart-schema.ts'
import { UpstreamError } from './upstream-error.ts'

/**
 * One cache instance per BFF router. Keyed by logical endpoint:
 *  - `products`        → the full list
 *  - `product:<id>`    → a single product
 * The value type is the union of what those keys hold; each handler reads back
 * the concrete shape it stored, so the union never leaks to callers.
 */
const cache = new TtlSwrCache<Product[] | Product>({
  ttlMs: CACHE_TTL_MS,
  staleTtlMs: CACHE_STALE_TTL_MS,
})

/** Seconds of `max-age` the browser may treat a response as fresh (mirrors TTL). */
const FRESH_MAX_AGE_S = Math.floor(CACHE_TTL_MS / 1000)

/**
 * Map the cache state to a coherent `Cache-Control`. `stale-while-revalidate`
 * mirrors our own SWR window so a shared cache behaves like the BFF: serve
 * fresh up to `max-age`, then serve stale (and let us revalidate) for the SWR
 * window. A hard miss is freshly fetched, so it's `max-age` from now too.
 */
function cacheControlFor(state: CacheState): string {
  const swr = Math.floor(CACHE_STALE_TTL_MS / 1000)
  if (state === 'fresh' || state === 'miss') {
    return `public, max-age=${String(FRESH_MAX_AGE_S)}, stale-while-revalidate=${String(swr)}`
  }
  // Already stale at the BFF: tell caches to revalidate, but allow brief reuse.
  return `public, max-age=0, stale-while-revalidate=${String(swr)}`
}

/** Send a clean JSON error, mapping a typed `UpstreamError` to the right status. */
function sendError(res: Response, error: unknown): void {
  if (error instanceof UpstreamError) {
    // 502/503-class failures are logged (operational signal); 404 is expected.
    if (error.httpStatus >= 500) {
      console.error(`[bff] upstream failure (${error.kind}):`, error.message, error.cause)
    }
    res
      .status(error.httpStatus)
      .json({ error: error.kind, message: publicMessageFor(error) })
    return
  }
  // Truly unexpected: log internally, return an opaque 500.
  console.error('[bff] unexpected handler error:', error)
  res.status(500).json({ error: 'internal_error', message: 'Internal Server Error' })
}

/** Client-safe message per failure kind (never includes upstream internals). */
function publicMessageFor(error: UpstreamError): string {
  switch (error.kind) {
    case 'not_found':
      return 'Resource not found'
    case 'timeout':
      return 'Upstream timed out'
    case 'bad_gateway':
    case 'invalid_payload':
      return 'Upstream service unavailable'
  }
}

export function createBffRouter(): Router {
  const router = Router()

  // GET /api/products → { products: Product[] }, validated + cached.
  router.get('/products', (_req: Request, res: Response): void => {
    void (async () => {
      try {
        const { value, state } = await cache.resolve('products', fetchProducts)
        const body: ProductsResponse = { products: value as Product[] }
        res
          .status(200)
          .set('Cache-Control', cacheControlFor(state))
          .set('X-Cache', state)
          .json(body)
      } catch (error) {
        sendError(res, error)
      }
    })()
  })

  // GET /api/products/:id → Product (validated) or 404.
  router.get('/products/:id', (req: Request, res: Response): void => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'bad_request', message: 'Invalid product id' })
      return
    }
    void (async () => {
      try {
        const { value, state } = await cache.resolve(`product:${String(id)}`, () =>
          fetchProductById(id),
        )
        res
          .status(200)
          .set('Cache-Control', cacheControlFor(state))
          .set('X-Cache', state)
          .json(value)
      } catch (error) {
        sendError(res, error)
      }
    })()
  })

  // POST /api/cart → validate body, proxy to FakeStore /carts (simulated), echo.
  //
  // FakeStore's write endpoints don't persist (documented in CLAUDE.md), so this
  // is intentionally an echo of the validated, normalized cart. The front uses it
  // as the optimistic-update target; the BFF's job is to validate the shape and
  // return a stable success envelope. Never cached (mutations must not be cached).
  router.post('/cart', (req: Request, res: Response): void => {
    const parsed = CartInputSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: 'bad_request',
        message: 'Invalid cart payload',
        // Field-level issues are safe to return: they describe the CLIENT's own
        // input, not server internals, and help the front surface errors.
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      })
      return
    }

    const totalQuantity = parsed.data.items.reduce((sum, item) => sum + item.quantity, 0)
    res.status(201).set('Cache-Control', 'no-store').json({
      ok: true,
      items: parsed.data.items,
      totalQuantity,
    })
  })

  return router
}
