import type { ReactNode } from 'react'
import type { Rating as RatingValue } from '@shared/types'
import styles from './Rating.module.css'

const MAX_STARS = 5

interface RatingProps {
  rating: RatingValue
}

/**
 * Star rating, accessible. The visual stars are decorative (`aria-hidden`); the
 * accessible name carries the actual numeric value + review count so screen
 * readers get the information without parsing glyphs.
 */
export function Rating({ rating }: RatingProps): ReactNode {
  const rounded = Math.round(rating.rate)
  const label = `Rated ${rating.rate} out of ${MAX_STARS} by ${rating.count} reviews`

  return (
    <span className={styles.rating} role="img" aria-label={label}>
      <span className={styles.stars} aria-hidden="true">
        {Array.from({ length: MAX_STARS }, (_, index) => (
          <span
            key={index}
            className={index < rounded ? styles.starFilled : styles.starEmpty}
          >
            ★
          </span>
        ))}
      </span>
      <span className={styles.count} aria-hidden="true">
        ({rating.count})
      </span>
    </span>
  )
}
