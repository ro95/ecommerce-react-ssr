/**
 * Validation schema for the cart mutation endpoint (POST /api/cart).
 *
 * This is a SERVER-side input contract, not a shared product type, so it lives
 * in the BFF rather than in `/shared`. We validate the request body at the
 * frontier: anything reaching the handler is already well-typed and bounded
 * (positive integer ids, positive integer quantities, at least one item, and a
 * sane upper bound to reject absurd payloads).
 */
import { z } from 'zod'

export const CartItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(999),
})

export const CartInputSchema = z.object({
  items: z.array(CartItemInputSchema).min(1).max(100),
})

export type CartInput = z.infer<typeof CartInputSchema>
