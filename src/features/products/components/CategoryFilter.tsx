import type { ReactNode } from 'react'
import styles from './CategoryFilter.module.css'

interface CategoryFilterProps {
  /** All selectable categories (derived from the loaded products). */
  categories: string[]
  /** Currently selected categories (from the URL). */
  selected: string[]
  /** Toggle one category in the multi-select. */
  onToggle: (category: string) => void
}

/**
 * Multi-select category filter as a labelled checkbox group. Uses a `fieldset`
 * + `legend` for the accessible group name and native checkboxes for free
 * keyboard support; the URL stays the source of truth (the `checked` state is
 * derived from `selected`, this component holds no state of its own).
 */
export function CategoryFilter({
  categories,
  selected,
  onToggle,
}: CategoryFilterProps): ReactNode {
  if (categories.length === 0) return null

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Category</legend>
      <ul className={styles.options}>
        {categories.map((category) => (
          <li key={category} className={styles.option}>
            <label className={styles.optionLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={selected.includes(category)}
                onChange={() => onToggle(category)}
              />
              <span className={styles.optionText}>{category}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
