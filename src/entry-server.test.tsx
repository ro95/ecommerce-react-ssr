import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import { dehydrate } from '@tanstack/react-query'
import type { Product } from '@shared/types'
import { App } from '@/App'
import { createQueryClient } from '@/app/queryClient'
import { PRODUCTS_QUERY_KEY } from '@/features/products/queries'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Fjallraven Backpack',
    price: 109.95,
    description: 'A backpack.',
    category: "men's clothing",
    image: 'https://example.com/img.jpg',
    rating: { rate: 3.9, count: 120 },
    ...overrides,
  }
}

function ServerRouter({ children }: { children: ReactNode }): ReactNode {
  return <StaticRouter location="/">{children}</StaticRouter>
}

describe('SSR — populated server render of the PLP', () => {
  it('renders product titles into the server HTML when the query cache is seeded', () => {
    // Seed the per-request cache exactly as the server prefetch would, using the
    // shared query key so the PLP reads it without refetching.
    const queryClient = createQueryClient()
    const products = [
      makeProduct({ id: 1, title: 'Fjallraven Backpack' }),
      makeProduct({ id: 2, title: 'Mens Casual T-Shirt' }),
    ]
    queryClient.setQueryData(PRODUCTS_QUERY_KEY, { products })

    const html = renderToString(
      <App
        queryClient={queryClient}
        router={ServerRouter}
        dehydratedState={dehydrate(queryClient)}
      />,
    )

    // Proof the tree rendered populated (not a loading shell).
    expect(html).toContain('Fjallraven Backpack')
    expect(html).toContain('Mens Casual T-Shirt')
    expect(html).toContain('$109.95')
    // The PLP heading is present (shell rendered).
    expect(html).toContain('Products')
    // Not stuck on the skeleton/loading branch.
    expect(html).not.toContain('Loading products')
  })

  it('renders the empty-state copy when the cache holds no products', () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(PRODUCTS_QUERY_KEY, { products: [] })

    const html = renderToString(
      <App
        queryClient={queryClient}
        router={ServerRouter}
        dehydratedState={dehydrate(queryClient)}
      />,
    )

    expect(html).toContain('No products available right now.')
  })
})
