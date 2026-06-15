import { ProductListSchema } from '@shared/types'
import type { Product, ProductsResponse } from '@shared/types'

/**
 * Data layer for products. The BFF (`/server`) exposes `GET /api/products`
 * returning `{ products: Product[] }` (already validated upstream against the
 * FakeStore schema). We re-validate here so the front never trusts the wire
 * shape blindly — a contract break surfaces as a typed error, not a runtime
 * `undefined` deep in the render tree.
 *
 * `baseUrl` is the only environment-dependent input:
 *  - client: '' (same-origin relative request)
 *  - server (SSR): `opts.origin`, e.g. `http://localhost:5173`
 *
 * It is intentionally NOT part of the query key (see queries.ts): the cache key
 * must be identical server/client or hydration mismatches.
 */
export async function fetchProducts(baseUrl: string): Promise<ProductsResponse> {
  const response = await fetch(`${baseUrl}/api/products`)

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`)
  }

  const json: unknown = await response.json()
  const products: Product[] = ProductListSchema.parse(
    (json as { products?: unknown }).products,
  )

  return { products }
}
