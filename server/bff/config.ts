/**
 * BFF runtime configuration, resolved once from the environment.
 *
 * No secrets here — FakeStore is a public, unauthenticated API. Values are
 * read from `process.env` (documented in `.env.example`) with safe defaults so
 * the BFF boots even with an empty environment. Centralising this keeps the
 * client and cache free of `process.env` lookups, which makes them trivially
 * unit-testable.
 */

/** Base URL of the upstream product API (FakeStore by default). */
export const UPSTREAM_API_URL: string =
  process.env.UPSTREAM_API_URL?.replace(/\/+$/, '') ?? 'https://fakestoreapi.com'

/** Fresh window for cached entries, in milliseconds. */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Cache TTL (fresh window) in ms. After this, an entry is stale but servable. */
export const CACHE_TTL_MS: number = parsePositiveInt(process.env.CACHE_TTL_MS, 60_000)

/**
 * How long a stale entry may still be served (stale-while-revalidate window)
 * before it is treated as a hard miss. Beyond TTL + this window a request must
 * block on a fresh upstream fetch. Kept generous so a flaky upstream degrades
 * gracefully rather than failing every request.
 */
export const CACHE_STALE_TTL_MS: number = parsePositiveInt(
  process.env.CACHE_STALE_TTL_MS,
  5 * 60_000,
)

/** Upstream request timeout (ms) — never let a hung upstream hang our request. */
export const UPSTREAM_TIMEOUT_MS: number = parsePositiveInt(
  process.env.UPSTREAM_TIMEOUT_MS,
  8_000,
)
