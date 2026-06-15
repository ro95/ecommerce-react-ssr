/**
 * Currency formatting. The FakeStore prices are USD; we format with a stable
 * locale/currency so the server-rendered string and the client-rendered string
 * are byte-identical (a locale that differs between Node and the browser would
 * cause a hydration mismatch on price text).
 */
const PRICE_LOCALE = 'en-US'
const PRICE_CURRENCY = 'USD'

const priceFormatter = new Intl.NumberFormat(PRICE_LOCALE, {
  style: 'currency',
  currency: PRICE_CURRENCY,
})

export function formatPrice(amount: number): string {
  return priceFormatter.format(amount)
}
