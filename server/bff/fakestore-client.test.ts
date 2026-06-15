/**
 * Unit tests for the FakeStore HTTP client — the BFF's only network boundary.
 *
 * Every test mocks `globalThis.fetch`; no real request ever leaves the process.
 * We assert that each transport / status / body outcome is translated into a
 * TYPED `UpstreamError` (never a raw fetch/abort/zod error), and that upstream
 * validation failures are NOT propagated as a corrupt success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchProducts, fetchProductById } from './fakestore-client.ts'
import { UpstreamError } from './upstream-error.ts'
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

/** Build a minimal Response-like object backed by a text body. */
function jsonResponse(body: unknown, init?: { status?: number }): Response {
  const status = init?.status ?? 200
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response
}

function emptyResponse(status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(''),
  } as unknown as Response
}

describe('fakestore-client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchProducts — happy path', () => {
    it('returns the validated product list', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse([VALID_PRODUCT])),
      )

      const products = await fetchProducts()
      expect(products).toEqual([VALID_PRODUCT])
    })
  })

  describe('transport failures → typed UpstreamError, no leak', () => {
    it('maps a network rejection to a bad_gateway UpstreamError', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('fetch failed')),
      )

      await expect(fetchProducts()).rejects.toMatchObject({
        name: 'UpstreamError',
        kind: 'bad_gateway',
      })
    })

    it('maps an AbortSignal.timeout (TimeoutError) to a timeout UpstreamError', async () => {
      const timeoutErr = new DOMException('The operation timed out.', 'TimeoutError')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr))

      const err = await fetchProducts().catch((e: unknown) => e)
      expect(err).toBeInstanceOf(UpstreamError)
      expect((err as UpstreamError).kind).toBe('timeout')
      expect((err as UpstreamError).httpStatus).toBe(504)
    })

    it('preserves the original cause for server-side logging but stays typed', async () => {
      const cause = new TypeError('ECONNREFUSED')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause))

      const err = (await fetchProducts().catch((e: unknown) => e)) as UpstreamError
      expect(err).toBeInstanceOf(UpstreamError)
      expect(err.cause).toBe(cause)
    })
  })

  describe('non-OK status mapping', () => {
    it('maps a 500 upstream status to bad_gateway', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse(500)))

      const err = (await fetchProducts().catch((e: unknown) => e)) as UpstreamError
      expect(err.kind).toBe('bad_gateway')
      expect(err.httpStatus).toBe(502)
    })

    it('maps a 404 upstream status to not_found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse(404)))

      const err = (await fetchProductById(999).catch((e: unknown) => e)) as UpstreamError
      expect(err.kind).toBe('not_found')
      expect(err.httpStatus).toBe(404)
    })
  })

  describe('Zod upstream validation — corrupt payload is NOT propagated', () => {
    it('rejects a malformed product list with invalid_payload (list)', async () => {
      // price is a string, rating missing → schema must reject.
      const malformed = [{ id: 1, title: 'x', price: 'free' }]
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(malformed)))

      const err = (await fetchProducts().catch((e: unknown) => e)) as UpstreamError
      expect(err).toBeInstanceOf(UpstreamError)
      expect(err.kind).toBe('invalid_payload')
      expect(err.httpStatus).toBe(502)
    })

    it('does not return a 200-shaped value when the body is corrupt', async () => {
      const corrupt = { not: 'an array' }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(corrupt)))

      await expect(fetchProducts()).rejects.toBeInstanceOf(UpstreamError)
    })

    it('maps non-JSON text to bad_gateway (not invalid_payload)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(jsonResponse('<html>oops</html>')),
      )

      const err = (await fetchProducts().catch((e: unknown) => e)) as UpstreamError
      expect(err.kind).toBe('bad_gateway')
    })
  })

  describe('fetchProductById — FakeStore quirks', () => {
    it('returns the validated product for a known id', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(VALID_PRODUCT)))
      expect(await fetchProductById(1)).toEqual(VALID_PRODUCT)
    })

    it('maps the empty-body quirk (200 + empty) to not_found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyResponse(200)))

      const err = (await fetchProductById(9999).catch((e: unknown) => e)) as UpstreamError
      expect(err.kind).toBe('not_found')
      expect(err.httpStatus).toBe(404)
    })

    it('maps a null/non-product 200 body to not_found (defense-in-depth)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null)))

      const err = (await fetchProductById(9999).catch((e: unknown) => e)) as UpstreamError
      expect(err.kind).toBe('not_found')
    })

    it('passes a per-request AbortSignal to fetch (timeout wiring)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_PRODUCT))
      vi.stubGlobal('fetch', fetchMock)

      await fetchProductById(1)
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    })
  })
})
