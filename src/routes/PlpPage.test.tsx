import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, cleanup, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Product } from '@shared/types'

/**
 * Hoisted in-memory localStorage: the page renders ProductCards which import the
 * cart store transitively (same rationale as ProductCard.test.tsx — zustand
 * binds storage at module-evaluation time).
 */
const { storageMock } = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storageMock: Storage = {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v))
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  }
  vi.stubGlobal('localStorage', storageMock)
  return { storageMock }
})

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter, useLocation } = await import('react-router')
const { PlpPage } = await import('./PlpPage')
const { PRODUCTS_QUERY_KEY } = await import('@/features/products/queries')
const { CartProvider } = await import('@/features/cart/CartProvider')
const { useCartStore } = await import('@/features/cart/store')

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    title: 'Plain Item',
    price: 19.99,
    description: 'desc',
    category: "men's clothing",
    image: 'https://example.com/img.jpg',
    rating: { rate: 4, count: 10 },
    ...overrides,
  }
}

const products: Product[] = [
  makeProduct({ id: 1, title: 'Blue Cotton Shirt', category: "men's clothing" }),
  makeProduct({ id: 2, title: 'Gold Necklace', category: 'jewelery' }),
  makeProduct({ id: 3, title: 'Womens Shirt', category: "women's clothing" }),
]

/** Surfaces the current URL search string so we can assert URL-as-source-of-truth. */
function LocationProbe(): ReactElement {
  const location = useLocation()
  return <div data-testid="search">{location.search}</div>
}

function renderPlp(initialEntries: string[] = ['/']): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  // Seed the cache so useProducts resolves synchronously (no loading branch),
  // mirroring the post-hydration state without going through the network.
  queryClient.setQueryData(PRODUCTS_QUERY_KEY, { products })

  return render(
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <PlpPage />
          <LocationProbe />
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>,
  )
}

function gridProductNames(): string[] {
  const headings = screen.queryAllByRole('heading', { level: 2 })
  return headings.map((h) => h.textContent ?? '')
}

beforeEach(() => {
  storageMock.clear()
  useCartStore.setState({ items: [] })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }),
  )
})

afterEach(() => {
  cleanup()
})

describe('PlpPage — search filters the list and writes the URL', () => {
  it('renders the full list initially', () => {
    renderPlp()
    expect(gridProductNames()).toEqual(['Blue Cotton Shirt', 'Gold Necklace', 'Womens Shirt'])
  })

  it('typing in the search box filters the grid and updates ?q (debounced)', async () => {
    const user = userEvent.setup()
    renderPlp()

    await user.type(screen.getByRole('searchbox', { name: /search products/i }), 'shirt')

    // The list filters down to titles containing "shirt".
    await vi.waitFor(() => {
      expect(gridProductNames()).toEqual(['Blue Cotton Shirt', 'Womens Shirt'])
    })
    // And the URL became the source of truth (?q=shirt) after the debounce.
    await vi.waitFor(() => {
      expect(screen.getByTestId('search').textContent).toContain('q=shirt')
    })
  })

  it('highlights the matched substring in titles with <mark>', async () => {
    const user = userEvent.setup()
    renderPlp()

    await user.type(screen.getByRole('searchbox', { name: /search products/i }), 'shirt')

    await vi.waitFor(() => {
      const marks = document.querySelectorAll('mark')
      expect(marks.length).toBeGreaterThan(0)
      expect([...marks].every((m) => m.textContent?.toLowerCase() === 'shirt')).toBe(true)
    })
  })
})

describe('PlpPage — category filter', () => {
  it('checking a category filters the grid and writes ?category', async () => {
    const user = userEvent.setup()
    renderPlp()

    await user.click(screen.getByRole('checkbox', { name: /jewelery/i }))

    expect(gridProductNames()).toEqual(['Gold Necklace'])
    expect(screen.getByTestId('search').textContent).toContain('category=jewelery')
  })
})

describe('PlpPage — URL is the source of truth on first render (SSR-parity)', () => {
  it('renders pre-filtered when the entry URL already carries ?q', () => {
    renderPlp(['/?q=necklace'])
    expect(gridProductNames()).toEqual(['Gold Necklace'])
  })

  it('shows an empty state with a reset action when nothing matches', async () => {
    const user = userEvent.setup()
    renderPlp(['/?q=zzz'])

    const region = screen.getByText(/no products match your filters/i)
    expect(region).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(within(document.body).getAllByRole('heading', { level: 2 }).length).toBe(3)
  })
})
