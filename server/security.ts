/**
 * Security headers middleware.
 *
 * Applied in PRODUCTION only. In development the CSP is deliberately NOT enforced
 * because Vite's HMR / react-refresh client injects inline scripts and uses
 * `eval`/`new Function` for fast module evaluation, plus an inline WebSocket
 * bootstrap — a strict `script-src 'self'` would break the dev experience. We
 * also avoid a report-only CSP in dev to keep the console clean; the prod path
 * is the one we actually ship and audit.
 *
 * No external dependency (e.g. helmet): the header set is small and explicit, so
 * hand-writing it keeps the dependency/audit surface minimal and the policy
 * legible — every directive below is justified for THIS app.
 */
import type { Request, Response, NextFunction } from 'express'

/**
 * Content-Security-Policy for production.
 *
 *  - default-src 'self'        baseline: only same-origin by default.
 *  - script-src 'self'         in prod, JS modules are served from our origin by
 *                              sirv. The SSR hydration state is a
 *                              `<script type="application/json">` block, which is
 *                              DATA, not executed code, so it needs no script
 *                              allowance and no nonce. No inline/eval scripts.
 *  - style-src 'self' 'unsafe-inline'
 *                              CSS Modules are emitted as same-origin stylesheets,
 *                              but React/streaming can inline critical style tags
 *                              and inline `style=""` attributes; 'unsafe-inline'
 *                              for styles is the pragmatic, low-risk allowance
 *                              (styles can't exfiltrate data the way scripts can).
 *  - img-src 'self' https://fakestoreapi.com data:
 *                              product images are served from fakestoreapi.com;
 *                              `data:` covers inlined placeholders/SVGs.
 *  - connect-src 'self'        the front only calls our own BFF (`/api/*`), never
 *                              FakeStore directly — the BFF is the single egress.
 *  - font-src 'self' data:     self-hosted / inlined fonts only.
 *  - object-src 'none'         no plugins (clickjacking / legacy vectors).
 *  - base-uri 'self'           block `<base>` hijacking of relative URLs.
 *  - form-action 'self'        forms can only post to our origin.
 *  - frame-ancestors 'none'    no embedding (clickjacking) — the modern,
 *                              CSP-level equivalent of X-Frame-Options: DENY.
 *  - upgrade-insecure-requests force https for any subresource when served over TLS.
 */
const PRODUCTION_CSP: string = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://fakestoreapi.com data:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

/**
 * Build the security middleware.
 *
 * @param isProduction when false, returns a no-op pass-through so dev/HMR is
 *   untouched. Passing the flag in (rather than reading NODE_ENV here) keeps the
 *   middleware pure and unit-testable.
 */
export function securityHeaders(
  isProduction: boolean,
): (req: Request, res: Response, next: NextFunction) => void {
  if (!isProduction) {
    return (_req: Request, _res: Response, next: NextFunction): void => {
      next()
    }
  }

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set({
      'Content-Security-Policy': PRODUCTION_CSP,
      // Defense-in-depth alongside CSP `frame-ancestors` for legacy browsers.
      'X-Frame-Options': 'DENY',
      // Stop MIME sniffing (e.g. a JSON response being run as a script).
      'X-Content-Type-Options': 'nosniff',
      // Don't leak full URLs (paths/query) to cross-origin destinations.
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      // Drop a few powerful features we never use.
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      // Local demo runs over http; HSTS is only meaningful over https and is
      // ignored by browsers on http, so it's safe to always send in prod. Keep
      // it conservative (no preload) since the deploy target is undecided.
      'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
      'X-DNS-Prefetch-Control': 'off',
    })
    next()
  }
}
