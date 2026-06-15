import { useState, type ChangeEvent, type ReactNode } from 'react'
import { useDebouncedCallback } from '@/lib/useDebouncedCallback'
import styles from './SearchBar.module.css'

/** Quiet window before the typed term is committed to the URL. */
const URL_DEBOUNCE_MS = 300

interface SearchBarProps {
  /** Current committed term (from the URL) used to seed the input. */
  initialQuery: string
  /** Commit a new term to the URL (debounced by this component). */
  onQueryChange: (query: string) => void
}

/**
 * Controlled search input. The visible value updates instantly (responsive
 * typing) while the URL write is debounced, so the address bar / filtering
 * follows ~300ms after the user stops typing — no history spam, no per-keystroke
 * re-render of the whole list driven by the router.
 */
export function SearchBar({ initialQuery, onQueryChange }: SearchBarProps): ReactNode {
  const [value, setValue] = useState(initialQuery)
  const debouncedCommit = useDebouncedCallback(onQueryChange, URL_DEBOUNCE_MS)

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const next = event.target.value
    setValue(next)
    debouncedCommit(next)
  }

  return (
    <div className={styles.search}>
      <label htmlFor="product-search" className={styles.label}>
        Search products
      </label>
      <input
        id="product-search"
        type="search"
        className={styles.input}
        value={value}
        onChange={handleChange}
        placeholder="Search by name…"
        autoComplete="off"
        enterKeyHint="search"
      />
    </div>
  )
}
