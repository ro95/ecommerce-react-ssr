import { Fragment, type ReactNode } from 'react'

interface HighlightedTextProps {
  /** The full text to render (e.g. a product title). */
  text: string
  /** The active search term; empty renders `text` verbatim. */
  query: string
}

/**
 * Wraps every case-insensitive occurrence of `query` inside `text` in a
 * `<mark>` (the semantically correct element for "relevant to the user's
 * current activity"). Pure presentation, no logic leakage: it never knows
 * about the URL or the filter state, it just receives the term.
 */
export function HighlightedText({ text, query }: HighlightedTextProps): ReactNode {
  const needle = query.trim()
  if (needle === '') return text

  const lowerText = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()

  const segments: Array<{ value: string; match: boolean }> = []
  let cursor = 0

  for (
    let index = lowerText.indexOf(lowerNeedle, cursor);
    index !== -1;
    index = lowerText.indexOf(lowerNeedle, cursor)
  ) {
    if (index > cursor) segments.push({ value: text.slice(cursor, index), match: false })
    segments.push({ value: text.slice(index, index + needle.length), match: true })
    cursor = index + needle.length
  }

  if (cursor < text.length) segments.push({ value: text.slice(cursor), match: false })

  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          {segment.match ? <mark>{segment.value}</mark> : segment.value}
        </Fragment>
      ))}
    </>
  )
}
