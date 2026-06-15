import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Core Web Vitals reporting (client-only).
 *
 * Subscribes to the five Core/loading metrics and forwards each one to a
 * `handler`. The default handler logs to the console in a readable form; the
 * indirection exists so a future transport (see the beacon extension point
 * below) is a one-line swap with no change to the wiring in `entry-client`.
 *
 * Must never run on the server: `web-vitals` reads browser-only APIs
 * (PerformanceObserver, document visibility). `reportWebVitals` guards on
 * `typeof window` defensively, and it is only ever called from the client
 * entrypoint after hydration.
 */
export type MetricHandler = (metric: Metric) => void

/**
 * Default handler: a single grouped, readable console line per metric.
 * `value` is rounded (CLS keeps decimals; the others are ms) and tagged with
 * the web-vitals `rating` (good / needs-improvement / poor).
 */
function logMetric(metric: Metric): void {
  const value = metric.name === 'CLS' ? metric.value.toFixed(4) : Math.round(metric.value)
  console.info(`[web-vitals] ${metric.name}: ${value} (${metric.rating})`)
}

/**
 * Subscribe to the Core Web Vitals and route each measurement to `handler`.
 *
 * No-op outside the browser so it is safe to import from shared code; in
 * practice it is called once from `entry-client` after `hydrateRoot`.
 *
 * Extension point — sending to a backend:
 * Replace `handler` (or wrap it) with a beacon, e.g.
 *
 *   reportWebVitals((metric) => {
 *     const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, id: metric.id })
 *     navigator.sendBeacon?.('/api/vitals', body)
 *   })
 *
 * `sendBeacon` is the right primitive here: it survives page unload (metrics
 * like CLS/LCP are finalized late) and does not block navigation. No network
 * call is made in Phase 3 by design (no endpoint yet).
 */
export function reportWebVitals(handler: MetricHandler = logMetric): void {
  if (typeof window === 'undefined') return

  onCLS(handler)
  onFCP(handler)
  onINP(handler)
  onLCP(handler)
  onTTFB(handler)
}
