import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Product } from '@shared/types'

/**
 * Hoisted in-memory localStorage so the cart store (imported transitively by the
 * components under test) binds to a working Storage. See store.test.ts for the
 * rationale (zustand caches the storage at module-evaluation time).
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

const { ProductCard } = await import('./ProductCard')
const { CartBadge } = await import('@/features/cart/components/CartBadge')
const { useCartStore } = await import('@/features/cart/store')

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

beforeEach(() => {
  storageMock.clear()
  useCartStore.setState({ items: [] })
  // syncCart POSTs to /api/cart; resolve it so the optimistic add is not rolled back.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' }),
  )
})

// The workspace does not enable Testing Library auto-cleanup (no global config),
// so unmount explicitly to avoid DOM leaking across tests.
afterEach(() => {
  cleanup()
})

describe('ProductCard — accessible presentation', () => {
  it('renders the product image, name, price and an accessible rating', () => {
    render(<ProductCard product={makeProduct()} />)

    const img = screen.getByRole('img', { name: 'Fjallraven Backpack' })
    expect(img).toHaveAttribute('src', 'https://example.com/img.jpg')
    // Dimensioned to reserve layout (no CLS).
    expect(img).toHaveAttribute('width', '240')
    expect(img).toHaveAttribute('height', '240')

    expect(screen.getByRole('heading', { name: 'Fjallraven Backpack' })).toBeInTheDocument()
    expect(screen.getByText('$109.95')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /Rated 3.9 out of 5 by 120 reviews/ }),
    ).toBeInTheDocument()
  })

  it('lazy-loads by default and eager-loads when priority is set (LCP hint)', () => {
    const { rerender } = render(<ProductCard product={makeProduct()} />)
    expect(screen.getByRole('img', { name: 'Fjallraven Backpack' })).toHaveAttribute(
      'loading',
      'lazy',
    )

    rerender(<ProductCard product={makeProduct()} priority />)
    expect(screen.getByRole('img', { name: 'Fjallraven Backpack' })).toHaveAttribute(
      'loading',
      'eager',
    )
  })
})

describe('ProductCard + CartBadge — add to cart updates the badge', () => {
  it('clicking "Add to cart" reveals the badge and keeps incrementing it', async () => {
    const user = userEvent.setup()
    render(
      <>
        <CartBadge />
        <ProductCard product={makeProduct({ id: 1 })} />
      </>,
    )

    // Empty cart → the badge renders nothing (and reserves no visible count).
    expect(screen.queryByLabelText(/items in cart/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Add to cart/ }))

    // The optimistic store commit reveals the badge without waiting on the
    // network: one click → exactly one item.
    const badge = await screen.findByLabelText(/items in cart/)
    expect(badge).toHaveTextContent('1')

    // Second click increments to 2: machine context and store stay in sync.
    await user.click(screen.getByRole('button', { name: /Add to cart/ }))
    expect(await screen.findByLabelText(/items in cart/)).toHaveTextContent('2')
  })

  // Regression guard for the lost-add bug: each ProductCard mounts its own cart
  // machine, so adding from a SECOND card must extend the cart (read the live
  // store), not overwrite it from a stale per-instance context.
  it('adding from two different cards accumulates instead of resetting to 1', async () => {
    const user = userEvent.setup()
    render(
      <>
        <CartBadge />
        <ProductCard product={makeProduct({ id: 1, title: 'Backpack' })} />
        <ProductCard product={makeProduct({ id: 2, title: 'Watch' })} />
      </>,
    )

    await user.click(screen.getByRole('button', { name: /Add to cart Backpack/ }))
    expect(await screen.findByLabelText(/items in cart/)).toHaveTextContent('1')

    // Different card, different machine instance — the count must reach 2, not reset.
    await user.click(screen.getByRole('button', { name: /Add to cart Watch/ }))
    expect(await screen.findByLabelText(/items in cart/)).toHaveTextContent('2')
  })
})
