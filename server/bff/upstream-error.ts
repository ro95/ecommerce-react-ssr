/**
 * Typed error for upstream (FakeStore) failures.
 *
 * Carrying a `status` lets the router translate failure modes into the right
 * HTTP code (404 vs 502 vs 504) without leaking the underlying cause or a stack
 * trace to the client. The original cause is preserved for server-side logging
 * via the standard `Error.cause` option.
 */
export type UpstreamErrorKind =
  | 'not_found' // upstream returned 404 — the resource genuinely doesn't exist
  | 'bad_gateway' // upstream reachable but errored / returned a non-OK status
  | 'timeout' // upstream did not respond within the deadline
  | 'invalid_payload' // upstream responded but the body failed Zod validation

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind

  constructor(kind: UpstreamErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UpstreamError'
    this.kind = kind
  }

  /** HTTP status to surface to our client for this failure kind. */
  get httpStatus(): number {
    switch (this.kind) {
      case 'not_found':
        return 404
      case 'timeout':
        return 504
      case 'bad_gateway':
      case 'invalid_payload':
        return 502
    }
  }
}
