import type { ReactNode } from 'react'
import styles from './QuantityStepper.module.css'

interface QuantityStepperProps {
  quantity: number
  productTitle: string
  onDecrement: () => void
  onIncrement: () => void
}

/**
 * Accessible +/- quantity control. Each button carries an explicit label that
 * names the product, so screen-reader users know which line they are changing.
 */
export function QuantityStepper({
  quantity,
  productTitle,
  onDecrement,
  onIncrement,
}: QuantityStepperProps): ReactNode {
  return (
    <div className={styles.stepper}>
      <button
        type="button"
        className={styles.button}
        onClick={onDecrement}
        aria-label={`Decrease quantity of ${productTitle}`}
      >
        −
      </button>
      <span className={styles.value} aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        className={styles.button}
        onClick={onIncrement}
        aria-label={`Increase quantity of ${productTitle}`}
      >
        +
      </button>
    </div>
  )
}
