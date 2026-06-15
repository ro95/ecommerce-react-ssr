import type { ReactNode } from 'react'
import styles from './ProductCardSkeleton.module.css'

/**
 * Loading placeholder matching ProductCard's box model so the grid does not
 * reflow when real cards replace skeletons (no CLS). Purely decorative →
 * hidden from assistive tech; the grid container announces the busy state.
 */
export function ProductCardSkeleton(): ReactNode {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.media} />
      <div className={styles.body}>
        <div className={styles.line} />
        <div className={`${styles.line} ${styles.lineShort}`} />
        <div className={styles.footer}>
          <div className={styles.price} />
          <div className={styles.button} />
        </div>
      </div>
    </div>
  )
}
