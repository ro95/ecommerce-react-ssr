/**
 * Shared contract between the front (`/src`) and the SSR/BFF server (`/server`).
 *
 * Zod is the single source of truth: the BFF validates upstream API responses
 * against these schemas (runtime safety at the network boundary), and the front
 * consumes the inferred TypeScript types. Do not break this contract without
 * syncing both sides.
 */
import { z } from 'zod'

/** Rating shape returned by the FakeStore API. */
export const RatingSchema = z.object({
  rate: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),
})

/** A single product as exposed by the BFF (mirrors FakeStore, validated). */
export const ProductSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  price: z.number().nonnegative(),
  description: z.string(),
  category: z.string(),
  image: z.string().url(),
  rating: RatingSchema,
})

export const ProductListSchema = z.array(ProductSchema)

export type Rating = z.infer<typeof RatingSchema>
export type Product = z.infer<typeof ProductSchema>

/** A product plus the quantity selected in the cart. */
export interface CartItem {
  product: Product
  quantity: number
}

/** Derived totals computed from the cart items (never persisted as source). */
export interface CartTotals {
  itemCount: number
  subtotal: number
}

/** Persisted cart shape (localStorage). Keep it minimal and versioned. */
export interface PersistedCart {
  version: number
  items: CartItem[]
}

/** Stable envelope for BFF list responses (lets us add meta without breaking callers). */
export interface ProductsResponse {
  products: Product[]
}
