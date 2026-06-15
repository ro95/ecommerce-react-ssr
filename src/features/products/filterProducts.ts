import type { Product } from '@shared/types'

/**
 * Criteria the PLP filters by. This is the decoded, typed view of the URL
 * search params (see `useProductFilters`); keeping it as a plain value object
 * is what makes `filterProducts` a pure function — trivially unit-testable and
 * usable identically on the server (SSR) and the client.
 */
export interface ProductFilterCriteria {
  /** Free-text search matched against the product title (case-insensitive). */
  query: string
  /** Selected category names. Empty = no category constraint (show all). */
  categories: string[]
}

/** Empty criteria: matches every product (renders the full list). */
export const EMPTY_FILTER_CRITERIA: ProductFilterCriteria = {
  query: '',
  categories: [],
}

function matchesQuery(product: Product, query: string): boolean {
  const trimmed = query.trim().toLowerCase()
  if (trimmed === '') return true
  return product.title.toLowerCase().includes(trimmed)
}

function matchesCategories(product: Product, categories: string[]): boolean {
  if (categories.length === 0) return true
  return categories.includes(product.category)
}

/**
 * Pure derivation: given the loaded products and the decoded URL criteria,
 * return the subset to render. Applied at render time on top of the SINGLE
 * `['products']` query (never a new query) so the dehydrated SSR cache stays
 * intact and the server already renders the filtered list from the URL.
 *
 * Order is preserved; an empty criteria returns the input order untouched.
 */
export function filterProducts(
  products: Product[],
  criteria: ProductFilterCriteria,
): Product[] {
  return products.filter(
    (product) =>
      matchesQuery(product, criteria.query) &&
      matchesCategories(product, criteria.categories),
  )
}

/**
 * Unique category list derived from the loaded products (sorted for stable UI
 * order). No extra network call — the categories come from the data already in
 * the cache, per the brief.
 */
export function deriveCategories(products: Product[]): string[] {
  return Array.from(new Set(products.map((product) => product.category))).sort()
}
