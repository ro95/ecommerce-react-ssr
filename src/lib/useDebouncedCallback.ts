import { useCallback, useEffect, useRef } from 'react'

/**
 * Returns a stable, debounced version of `callback`: invocations are coalesced
 * and only the last one fires after `delayMs` of quiet. Used to throttle URL
 * writes while the user types in the search box (no history spam, no work per
 * keystroke).
 *
 * The latest `callback` is read through a ref so the debounced identity stays
 * stable across renders (safe to pass to effects / event handlers) while never
 * calling a stale closure. The pending timer is cleared on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delayMs)
    },
    [delayMs],
  )
}
