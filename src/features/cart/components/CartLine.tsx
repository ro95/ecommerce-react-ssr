import type { ReactNode } from 'react'
import type { CartItem } from '@shared/types'
import { formatPrice } from '@/lib/format'
import { QuantityStepper } from './QuantityStepper'
import styles from './CartLine.module.css'

const IMAGE_SIZE = 80

interface CartLineProps {
  item: CartItem
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
}

export function CartLine({
  item,
  onIncrement,
  onDecrement,
  onRemove,
}: CartLineProps): ReactNode {
  const { product, quantity } = item
  const lineTotal = product.price * quantity

  return (
    <li className={styles.line}>
      <img
        className={styles.image}
        src={product.image}
        alt=""
        width={IMAGE_SIZE}
        height={IMAGE_SIZE}
        loading="lazy"
        decoding="async"
      />
      <div className={styles.info}>
        <h2 className={styles.title}>{product.title}</h2>
        <span className={styles.unitPrice}>{formatPrice(product.price)} each</span>
      </div>
      <span className={styles.stepperSlot}>
        <QuantityStepper
          quantity={quantity}
          productTitle={product.title}
          onDecrement={onDecrement}
          onIncrement={onIncrement}
        />
      </span>
      <span className={styles.lineTotal}>{formatPrice(lineTotal)}</span>
      <button
        type="button"
        className={styles.remove}
        onClick={onRemove}
        aria-label={`Remove ${product.title} from cart`}
      >
        Remove
      </button>
    </li>
  )
}
