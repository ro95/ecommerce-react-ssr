import type { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { Header } from './Header'
import styles from './Layout.module.css'

const MAIN_CONTENT_ID = 'main-content'

/**
 * App shell: skip-link + landmarks (header / main). Rendered as the layout
 * route so every page shares it. `Outlet` renders the matched child route.
 */
export function Layout(): ReactNode {
  return (
    <>
      <a className={styles.skipLink} href={`#${MAIN_CONTENT_ID}`}>
        Skip to main content
      </a>
      <Header />
      <main id={MAIN_CONTENT_ID} className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
