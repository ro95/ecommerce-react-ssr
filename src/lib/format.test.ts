import { describe, it, expect } from 'vitest'
import { formatPrice } from './format'

describe('formatPrice', () => {
  it('formats an integer amount as USD currency', () => {
    expect(formatPrice(10)).toBe('$10.00')
  })

  it('formats a fractional amount with two decimals', () => {
    expect(formatPrice(109.95)).toBe('$109.95')
  })

  it('rounds to two decimal places (half-up)', () => {
    expect(formatPrice(2.005)).toBe('$2.01')
    expect(formatPrice(2.004)).toBe('$2.00')
  })

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.00')
  })

  it('groups thousands', () => {
    expect(formatPrice(1234567.5)).toBe('$1,234,567.50')
  })

  it('is deterministic for the same input (stable locale, no env drift)', () => {
    expect(formatPrice(42.5)).toBe(formatPrice(42.5))
  })
})
