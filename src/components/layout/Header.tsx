import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { CartBadge } from '@/features/cart/components/CartBadge'
import styles from './Header.module.css'

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  // CSS-module access is `string | undefined` under noUncheckedIndexedAccess;
  // filter falsy values so the joined className never contains "undefined".
  return [styles.navLink, isActive && styles.navLinkActive].filter(Boolean).join(' ')
}

/**
 * Global site header. Server-renderable (no client interactivity yet).
 *
 * The `cartSlot` reserves space for the cart count indicator wired in Phase 2,
 * so introducing the badge later will not cause cumulative layout shift (CLS).
 */
export function Header(): ReactNode {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <NavLink to="/" className={styles.brand}>
          E-shop Gallery
        </NavLink>
        <nav className={styles.nav} aria-label="Primary">
          <NavLink to="/" end className={navLinkClassName}>
            Products
          </NavLink>
          <NavLink to="/cart" className={navLinkClassName}>
            Cart
            {/* Reserved fixed-size slot → revealing the badge causes no CLS. */}
            <span className={styles.cartSlot}>
              <CartBadge />
            </span>
          </NavLink>
        </nav>
      </div>
    </header>
  )
}
