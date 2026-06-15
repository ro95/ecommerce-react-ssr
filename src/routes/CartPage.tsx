import type { ReactNode } from 'react'
import styles from './CartPage.module.css'

/**
 * Cart Page (route `/cart`). Placeholder for Phase 1 — the cart UI, optimistic
 * updates (XState), persistence (Zustand) and rollback land in Phase 2.
 */
export function CartPage(): ReactNode {
  return (
    <section className={styles.page} aria-labelledby="cart-title">
      <h1 id="cart-title" className={styles.title}>
        Cart
      </h1>
      <p className={styles.placeholder}>Your cart coming soon.</p>
    </section>
  )
}
