import type { ReactNode } from 'react'
import styles from './RouteFallback.module.css'

/**
 * Suspense fallback for lazy-loaded routes (code splitting).
 *
 * Kept intentionally minimal and zero-layout: a `role="status"` live region so
 * assistive tech announces the pending navigation, and `aria-busy` for the
 * loading semantics. It reserves no fixed height and shifts nothing already on
 * screen, so swapping it for the resolved route introduces no CLS.
 *
 * Note: on SSR the lazy route's `import()` is already in the module graph, so
 * `renderToPipeableStream` resolves it before flushing the shell and this
 * fallback is never streamed to the client for the requested route. It only
 * shows during pure client-side navigation to a not-yet-loaded chunk.
 */
export function RouteFallback(): ReactNode {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={styles.fallback}>
      <span className={styles.srOnly}>Loading…</span>
    </div>
  )
}
