import type { ReactNode } from 'react'
import { Link } from 'react-router'

/**
 * Catch-all route. Kept minimal in Phase 1; the server is responsible for
 * setting the 404 status code based on the matched route.
 */
export function NotFoundPage(): ReactNode {
  return (
    <section aria-labelledby="notfound-title">
      <h1 id="notfound-title">Page not found</h1>
      <p>
        The page you are looking for does not exist. <Link to="/">Back to products</Link>.
      </p>
    </section>
  )
}
