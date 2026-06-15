/**
 * In-memory cache with TTL, stale-while-revalidate (SWR) and request coalescing.
 *
 * Why a hand-rolled cache rather than a library?
 *  - The BFF is a thin proxy with a handful of keys; a Map with timestamps is
 *    enough and keeps the dependency surface (and the audit surface) minimal.
 *  - It lets us express exactly the three behaviours the brief asks for, with
 *    the reasoning inline.
 *
 * Three behaviours, layered:
 *
 *  1. TTL — each entry carries `storedAt`. Within `ttlMs` it is FRESH and served
 *     directly. After `ttlMs` it is STALE.
 *
 *  2. Stale-while-revalidate — a STALE entry (but within `ttlMs + staleTtlMs`)
 *     is still returned immediately, and a background revalidation is kicked off
 *     so the next caller gets fresh data. The user never waits on the network
 *     for a value we already have. Past the stale window the entry is a hard
 *     miss and the caller must block on a fresh fetch.
 *
 *  3. Coalescing (single-flight) — concurrent misses (or background revalidations)
 *     for the same key share ONE in-flight upstream promise via `inflight`. This
 *     prevents a thundering herd hammering FakeStore when the cache is cold or an
 *     entry just expired under load.
 *
 * Invalidation strategy:
 *  - Primary mechanism is time-based (TTL + SWR window); the data is a public
 *    product catalogue with no write path we own, so there is no event that
 *    should force-evict. Mutations (POST /cart) are simulated upstream and do
 *    not affect product data, so they trigger no invalidation.
 *  - `delete`/`clear` are exposed for explicit/manual invalidation and for test
 *    isolation. If a real write path appeared (e.g. an admin updating a product),
 *    the handler would call `cache.delete(key)` after the write to force a
 *    refetch — that is the seam, intentionally left in place.
 *
 * Memory: this is unbounded by design for a fixed, tiny keyspace (products list
 * + per-id). If the keyspace became user-driven, an LRU bound would be required;
 * noted as a trade-off rather than implemented to avoid over-engineering.
 *
 * Concurrency note: Node runs this on a single thread, so the read-modify-write
 * sequences below are not interleaved at the statement level. No locking needed.
 */

/** Freshness of a cache lookup, surfaced so handlers can set `Cache-Control`. */
export type CacheState = 'fresh' | 'stale' | 'miss'

export interface CacheResult<T> {
  value: T
  state: CacheState
}

interface CacheEntry<T> {
  value: T
  storedAt: number
}

interface CacheOptions {
  /** Fresh window in ms. */
  ttlMs: number
  /** Additional window (after TTL) during which a stale value is still served. */
  staleTtlMs: number
}

/**
 * A loader fetches and validates a fresh value for a key. It MUST throw on
 * failure (network / validation); the cache only stores resolved values.
 */
export type Loader<T> = () => Promise<T>

export class TtlSwrCache<T> {
  readonly #store = new Map<string, CacheEntry<T>>()
  /** One in-flight upstream promise per key (request coalescing). */
  readonly #inflight = new Map<string, Promise<T>>()
  readonly #ttlMs: number
  readonly #staleTtlMs: number

  constructor(options: CacheOptions) {
    this.#ttlMs = options.ttlMs
    this.#staleTtlMs = options.staleTtlMs
  }

  /**
   * Resolve a value for `key`:
   *  - FRESH hit  → return immediately, no upstream call.
   *  - STALE hit  → return immediately, revalidate in the background (SWR).
   *  - hard miss  → coalesce on the in-flight promise and await it.
   *
   * `state` lets the caller emit a coherent `Cache-Control`/`X-Cache` header.
   */
  async resolve(key: string, loader: Loader<T>): Promise<CacheResult<T>> {
    const entry = this.#store.get(key)
    const now = Date.now()

    if (entry) {
      const age = now - entry.storedAt
      if (age <= this.#ttlMs) {
        return { value: entry.value, state: 'fresh' }
      }
      if (age <= this.#ttlMs + this.#staleTtlMs) {
        // Serve stale now; refresh for the next caller. A failed background
        // revalidation is swallowed (we already have a servable value) but
        // logged, so a flaky upstream doesn't reject this request.
        void this.#revalidate(key, loader).catch((error: unknown) => {
          console.error(`[cache] background revalidation failed for "${key}":`, error)
        })
        return { value: entry.value, state: 'stale' }
      }
    }

    // Hard miss (no entry, or beyond the stale window): block on a fresh fetch,
    // sharing one in-flight promise across concurrent callers for this key.
    const value = await this.#revalidate(key, loader)
    return { value, state: 'miss' }
  }

  /**
   * Fetch a fresh value through the single-flight gate and store it. All callers
   * racing on the same key during the fetch resolve to the same promise.
   */
  #revalidate(key: string, loader: Loader<T>): Promise<T> {
    const existing = this.#inflight.get(key)
    if (existing) return existing

    const promise = loader()
      .then((value) => {
        this.#store.set(key, { value, storedAt: Date.now() })
        return value
      })
      .finally(() => {
        this.#inflight.delete(key)
      })

    this.#inflight.set(key, promise)
    return promise
  }

  /** Explicit invalidation seam (manual eviction / write-through / tests). */
  delete(key: string): void {
    this.#store.delete(key)
  }

  /** Drop everything (test isolation / global flush). */
  clear(): void {
    this.#store.clear()
    this.#inflight.clear()
  }
}
