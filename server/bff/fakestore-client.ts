/**
 * FakeStore HTTP client — the only place the BFF talks to the network.
 *
 * Responsibilities (and nothing else):
 *  - perform the request with Node's native `fetch` (no extra HTTP dependency),
 *  - enforce a hard timeout via `AbortSignal.timeout` so a hung upstream can't
 *    hang our request,
 *  - translate transport / status outcomes into a typed `UpstreamError`,
 *  - validate the JSON body against the SHARED Zod schema before it leaves this
 *    module, so the rest of the server only ever sees trusted, typed data.
 *
 * Caching, HTTP framing and security headers live elsewhere — this stays a pure
 * I/O boundary, which keeps the business/cache code testable without a network.
 */
import type { z } from 'zod'
import { ProductSchema, ProductListSchema } from '../../shared/types.ts'
import type { Product } from '../../shared/types.ts'
import { UPSTREAM_API_URL, UPSTREAM_TIMEOUT_MS } from './config.ts'
import { UpstreamError } from './upstream-error.ts'

/**
 * GET `path` from the upstream and validate the parsed JSON against `schema`.
 * Every failure mode becomes a typed `UpstreamError`; this never throws a raw
 * fetch/abort/zod error at the caller.
 */
async function fetchAndValidate<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${UPSTREAM_API_URL}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      // Native per-request deadline; aborts the socket if upstream stalls.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (cause) {
    // `AbortSignal.timeout` rejects with a TimeoutError; everything else is a
    // transport failure (DNS, connection refused, TLS, ...).
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      throw new UpstreamError('timeout', `Upstream timed out: ${path}`, { cause })
    }
    throw new UpstreamError('bad_gateway', `Upstream request failed: ${path}`, { cause })
  }

  if (response.status === 404) {
    throw new UpstreamError('not_found', `Upstream resource not found: ${path}`)
  }
  if (!response.ok) {
    throw new UpstreamError(
      'bad_gateway',
      `Upstream responded ${String(response.status)} for ${path}`,
    )
  }

  // FakeStore quirk: an unknown id returns `200` with an EMPTY body (no JSON),
  // not a 404. Read as text first so we can distinguish "empty" (treat as not
  // found by the caller) from "malformed JSON" (a genuine upstream/transport
  // fault → 502).
  const raw = await response.text()
  if (raw.trim() === '') {
    throw new UpstreamError('not_found', `Upstream returned an empty body for ${path}`)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch (cause) {
    throw new UpstreamError('bad_gateway', `Upstream returned non-JSON for ${path}`, {
      cause,
    })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    // Validation failure is a contract breach on the upstream side: surface it
    // as a 502, log the details server-side, never echo them to the client.
    throw new UpstreamError(
      'invalid_payload',
      `Upstream payload failed validation for ${path}`,
      { cause: parsed.error },
    )
  }
  return parsed.data
}

/** Fetch + validate the full product list. */
export function fetchProducts(): Promise<Product[]> {
  return fetchAndValidate('/products', ProductListSchema)
}

/**
 * Fetch + validate a single product by id.
 *
 * Unknown ids are handled in `fetchAndValidate` (FakeStore returns `200` with an
 * empty body, mapped to `not_found`). As defense-in-depth, if the upstream ever
 * returns a `null`/non-product body that fails `ProductSchema`, we also treat
 * that as `not_found` rather than a 502 — "no such product" is the right
 * semantic for a by-id lookup that yields nothing usable.
 */
export async function fetchProductById(id: number): Promise<Product> {
  const path = `/products/${String(id)}`
  try {
    return await fetchAndValidate(path, ProductSchema)
  } catch (error) {
    if (error instanceof UpstreamError && error.kind === 'invalid_payload') {
      throw new UpstreamError('not_found', `Product ${String(id)} not found`, {
        cause: error,
      })
    }
    throw error
  }
}
