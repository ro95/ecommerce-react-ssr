/**
 * Unit tests for the TTL + stale-while-revalidate + coalescing cache.
 *
 * These exercise the cache CLASS directly (deterministic, no network): TTL
 * freshness, the SWR window (stale served immediately + background revalidation),
 * request coalescing (single-flight on a cold key), and the hard-miss path past
 * the stale window. Fake timers make the time-based behaviour deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TtlSwrCache } from './cache.ts'

const TTL_MS = 60_000
const STALE_MS = 5 * 60_000

/** A loader that records its call count and resolves to a tagged value. */
function makeLoader(value: string): { loader: () => Promise<string>; calls: () => number } {
  let calls = 0
  return {
    loader: () => {
      calls += 1
      return Promise.resolve(value)
    },
    calls: () => calls,
  }
}

describe('TtlSwrCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('TTL — fresh hits', () => {
    it('serves a cold key as a hard miss, fetching upstream once', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const { loader, calls } = makeLoader('v1')

      const result = await cache.resolve('k', loader)

      expect(result).toEqual({ value: 'v1', state: 'miss' })
      expect(calls()).toBe(1)
    })

    it('serves two close requests from one upstream fetch (fresh hit)', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const { loader, calls } = makeLoader('v1')

      await cache.resolve('k', loader)
      // Advance well within the TTL window.
      vi.setSystemTime(TTL_MS - 1)
      const second = await cache.resolve('k', loader)

      expect(second).toEqual({ value: 'v1', state: 'fresh' })
      expect(calls()).toBe(1)
    })

    it('treats age exactly at ttlMs as still fresh (boundary)', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const { loader, calls } = makeLoader('v1')

      await cache.resolve('k', loader)
      vi.setSystemTime(TTL_MS)
      const second = await cache.resolve('k', loader)

      expect(second.state).toBe('fresh')
      expect(calls()).toBe(1)
    })
  })

  describe('SWR — stale served immediately, revalidate in background', () => {
    it('serves the stale value immediately and refreshes for the next caller', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      let current = 'v1'
      let calls = 0
      const loader = (): Promise<string> => {
        calls += 1
        return Promise.resolve(current)
      }

      await cache.resolve('k', loader) // prime: calls=1
      current = 'v2'

      // Move into the stale window (past TTL, within TTL+STALE).
      vi.setSystemTime(TTL_MS + 1)
      const stale = await cache.resolve('k', loader)

      // Old value returned immediately, marked stale.
      expect(stale).toEqual({ value: 'v1', state: 'stale' })
      expect(calls).toBe(2) // background revalidation was kicked off

      // Let the background revalidation settle, then the next caller is fresh.
      await vi.runAllTimersAsync()
      const next = await cache.resolve('k', loader)
      expect(next).toEqual({ value: 'v2', state: 'fresh' })
    })

    it('swallows a failed background revalidation without rejecting the stale request', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      let mode: 'ok' | 'fail' = 'ok'
      const loader = (): Promise<string> => {
        if (mode === 'fail') return Promise.reject(new Error('upstream down'))
        return Promise.resolve('v1')
      }

      await cache.resolve('k', loader) // calls=1, stored v1
      mode = 'fail'
      vi.setSystemTime(TTL_MS + 1)

      // Stale request resolves with the cached value despite the failing refresh.
      const stale = await cache.resolve('k', loader)
      expect(stale).toEqual({ value: 'v1', state: 'stale' })

      await vi.runAllTimersAsync()
      expect(errorSpy).toHaveBeenCalledOnce()
      errorSpy.mockRestore()
    })

    it('treats a request past the stale window as a hard miss (blocks on fetch)', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      let current = 'v1'
      let calls = 0
      const loader = (): Promise<string> => {
        calls += 1
        return Promise.resolve(current)
      }

      await cache.resolve('k', loader) // calls=1
      current = 'v2'
      // Past TTL + STALE: hard miss, must block on a fresh fetch.
      vi.setSystemTime(TTL_MS + STALE_MS + 1)
      const result = await cache.resolve('k', loader)

      expect(result).toEqual({ value: 'v2', state: 'miss' })
      expect(calls).toBe(2)
    })
  })

  describe('coalescing — single-flight on a cold key', () => {
    it('shares ONE upstream fetch across N concurrent misses', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      let calls = 0
      let resolveFetch: (v: string) => void = () => undefined
      const loader = (): Promise<string> => {
        calls += 1
        return new Promise<string>((resolve) => {
          resolveFetch = resolve
        })
      }

      // Fire 5 concurrent requests on a cold key before the fetch resolves.
      const pending = Promise.all([
        cache.resolve('k', loader),
        cache.resolve('k', loader),
        cache.resolve('k', loader),
        cache.resolve('k', loader),
        cache.resolve('k', loader),
      ])

      // Exactly one upstream call should have been started.
      expect(calls).toBe(1)

      resolveFetch('v1')
      const results = await pending

      expect(calls).toBe(1)
      expect(results).toHaveLength(5)
      for (const r of results) {
        expect(r.value).toBe('v1')
        expect(r.state).toBe('miss')
      }
    })

    it('clears the in-flight slot so a later miss re-fetches', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      let calls = 0
      const loader = (): Promise<string> => {
        calls += 1
        return Promise.resolve(`v${String(calls)}`)
      }

      await cache.resolve('k', loader) // calls=1
      // Past the stale window → hard miss → a brand new in-flight fetch.
      vi.setSystemTime(TTL_MS + STALE_MS + 1)
      const second = await cache.resolve('k', loader)

      expect(calls).toBe(2)
      expect(second.value).toBe('v2')
    })
  })

  describe('invalidation seams', () => {
    it('delete(key) forces the next call to re-fetch', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const { loader, calls } = makeLoader('v1')

      await cache.resolve('k', loader)
      cache.delete('k')
      await cache.resolve('k', loader)

      expect(calls()).toBe(2)
    })

    it('clear() drops every entry', async () => {
      const cache = new TtlSwrCache<string>({ ttlMs: TTL_MS, staleTtlMs: STALE_MS })
      const a = makeLoader('a')
      const b = makeLoader('b')

      await cache.resolve('a', a.loader)
      await cache.resolve('b', b.loader)
      cache.clear()
      await cache.resolve('a', a.loader)
      await cache.resolve('b', b.loader)

      expect(a.calls()).toBe(2)
      expect(b.calls()).toBe(2)
    })
  })
})
