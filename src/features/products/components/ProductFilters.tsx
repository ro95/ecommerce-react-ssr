import type { ReactNode } from 'react'
import { SearchBar } from './SearchBar'
import { CategoryFilter } from './CategoryFilter'
import styles from './ProductFilters.module.css'

interface ProductFiltersProps {
  query: string
  categories: string[]
  selectedCategories: string[]
  onQueryChange: (query: string) => void
  onToggleCategory: (category: string) => void
}

/**
 * Filter toolbar for the PLP: the search box plus the category multi-select.
 * Pure composition — it owns no state; the URL (via `useProductFilters` in the
 * page) is the source of truth, this just wires controls to callbacks.
 */
export function ProductFilters({
  query,
  categories,
  selectedCategories,
  onQueryChange,
  onToggleCategory,
}: ProductFiltersProps): ReactNode {
  return (
    <div className={styles.toolbar}>
      <SearchBar initialQuery={query} onQueryChange={onQueryChange} />
      <CategoryFilter
        categories={categories}
        selected={selectedCategories}
        onToggle={onToggleCategory}
      />
    </div>
  )
}
