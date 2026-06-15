import type { ReactNode } from 'react'
import { useCart } from '@/features/cart/useCart'
import styles from './CartSyncStatus.module.css'

/**
 * Global cart-sync error surface.
 *
 * Mounted once in the app shell (Layout) so a failed optimistic sync is visible
 * from ANY route — including an add-to-cart failure triggered on the PLP, which
 * would otherwise roll back silently. Reads the shared cart machine via useCart.
 *
 * Renders nothing (and reserves no space) when there is no error, so it never
 * causes layout shift.
 */
export function CartSyncStatus(): ReactNode {
  const { error, retry, dismissError } = useCart()

  if (!error) {
    return null
  }

  return (
    <div role="alert" className={styles.banner}>
      <span className={styles.message}>{error}</span>
      <span className={styles.actions}>
        <button type="button" className={styles.action} onClick={retry}>
          Retry
        </button>
        <button type="button" className={styles.action} onClick={dismissError}>
          Dismiss
        </button>
      </span>
    </div>
  )
}
