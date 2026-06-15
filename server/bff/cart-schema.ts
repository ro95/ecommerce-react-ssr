/**
 * Validation schema for the cart mutation endpoint (POST /api/cart).
 *
 * This is a SERVER-side input contract, not a shared product type, so it lives
 * in the BFF rather than in `/shared`. We validate the request body at the
 * frontier: anything reaching the handler is already well-typed and bounded
 * (positive integer ids, positive integer quantities, and a sane upper bound to
 * reject absurd payloads).
 *
 * The endpoint syncs the FULL cart state after every mutation, so an EMPTY cart
 * is a legitimate body (it is what "remove the last item" produces) — we do not
 * require a minimum item count.
 */
import { z } from 'zod'

export const CartItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(999),
})

export const CartInputSchema = z.object({
  items: z.array(CartItemInputSchema).max(100),
})

export type CartInput = z.infer<typeof CartInputSchema>
