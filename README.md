# E-shop Gallery — Production-grade Frontend MVP

A server-side-rendered e-commerce product gallery with a production-ready cart,
built with **React 19** on a **custom Vite SSR** setup (no meta-framework), per
the kata constraints. The emphasis is on rendering strategy, performance,
type-safety and an architecture that scales — not on feature count.

> Functional requirements live in [Instruction.md](Instruction.md).
> The full rationale behind every choice (with the problems encountered) is in
> [docs/DECISIONS-TECHNIQUES.md](docs/DECISIONS-TECHNIQUES.md) — Q&A format.

---

## Features

**User Story 1 — Product List Page (PLP)**
- Products fetched from [FakeStore API](https://fakestoreapi.com) through a BFF,
  **server-side rendered with data** (no empty-shell flash, no client refetch).
- Image, name, price, accessible rating; loading skeletons, error and empty states.
- Responsive grid, dimensioned + lazy-loaded images (no layout shift).

**User Story 2 — Shopping Cart**
- **Optimistic updates with rollback** on sync failure, modelled with an XState
  state machine; instant, non-blocking UI.
- **Persisted** across sessions (localStorage), SSR-safe.
- Global error surface (a failed sync is announced from any route).

**Bonus**
- **Route-based code splitting** (lazy Cart route, SSR-safe).
- **Search** (debounced, with highlighting) + **multi-criteria category filters**,
  with **URL as the source of truth** (shareable, bookmarkable, back/forward).
- **Core Web Vitals** reporting (CLS/LCP/INP/FCP/TTFB).
- **BFF caching**: TTL + stale-while-revalidate + request coalescing.
- **Security headers** (CSP, HSTS, …) in production.
- **Bundle analysis** (`npm run analyze`).

---

## Tech stack

| Concern            | Choice                                                            |
| ------------------ | ----------------------------------------------------------------- |
| UI                 | React 19 (`renderToPipeableStream` streaming SSR)                 |
| Rendering          | **Custom Vite SSR** + Express (no Next/Nuxt)                      |
| Language           | TypeScript (strict, `noUncheckedIndexedAccess`)                   |
| Data / cache       | TanStack Query (dehydrate/hydrate) + a BFF cache                  |
| Cart state         | Zustand (store + persistence) **+** XState (optimistic/rollback)  |
| Validation         | Zod (single source of truth in `/shared`)                        |
| Styling            | CSS Modules (zero runtime)                                        |
| Tests              | Vitest + Testing Library (jsdom) / supertest (node)               |

---

## Quick start

**Prerequisites:** Node **≥ 22** (the dev server runs TypeScript via Node's
native type-stripping). Uses `npm`.

```bash
npm install

# Development — SSR + Vite HMR
npm run dev                 # → http://localhost:5173

# Production — build then serve the SSR bundle
npm run build
npm run preview             # → http://localhost:5173
```

Optional configuration (defaults are safe; see [.env.example](.env.example)):

```bash
PORT=5173                          # server port
UPSTREAM_API_URL=https://fakestoreapi.com
CACHE_TTL_MS=60000                 # BFF fresh window
```

### Scripts

| Script               | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | SSR dev server with HMR                            |
| `npm run build`      | Build client (`dist/client`) + SSR (`dist/server`) |
| `npm run preview`    | Serve the production build                         |
| `npm run typecheck`  | `tsc --noEmit`                                      |
| `npm run lint`       | ESLint (type-checked)                              |
| `npm test`           | Vitest (node + jsdom projects)                     |
| `npm run test:coverage` | Coverage report                                 |
| `npm run analyze`    | Build + interactive bundle treemap (`dist/bundle-stats.html`) |

---

## Architecture

```
/server          # Node side — Express SSR server + BFF
  index.ts       #   dev (Vite middleware) / prod (static + built bundle)
  ssr.ts         #   shared streaming pipeline
  bff/           #   FakeStore proxy + cache (TTL/SWR/coalescing) + Zod validation
  security.ts    #   production security headers (CSP, HSTS, …)
/src             # React side
  entry-server.tsx / entry-client.tsx   # the two ends of the SSR contract
  App.tsx        #   single tree shared by server & client (mismatch-free hydration)
  app/           #   router, query client, providers
  features/
    products/    #   PLP, product card, search & filters (pure filter fn + hooks)
    cart/        #   Zustand store, XState machine, CartProvider, cart UI
  components/layout/   # shell (header, layout, skip-link)
  routes/        #   PLP / Cart / 404 pages
/shared          # Front/back CONTRACT — Zod schemas → inferred types
```

**Boundary.** The front (`/src`) and the server (`/server`) only meet through
two seams: the typed **contract** in [shared/types.ts](shared/types.ts) (Zod
schemas, single source of truth) and the **SSR render contract** (an async
`render(url, { origin, callbacks })` returning a pipeable stream + `headTags`).

### SSR data flow (mismatch-free, zero refetch)

```
request → server: render(url, { origin })
  1. create a per-request QueryClient (never shared across requests)
  2. prefetch products from the BFF (origin) → cache is warm
  3. dehydrate the cache → serialize into <script id="__RQ_STATE__" type="application/json">
  4. renderToPipeableStream(<App/>) → PLP rendered WITH data, streamed to the client
client: read #__RQ_STATE__ → JSON.parse → hydrate from it (no refetch, no mismatch)
```

The same `<App>` tree runs on both sides; only the router differs
(`StaticRouter` server / `BrowserRouter` client). Filters live in the URL, so
the **server renders the already-filtered list** (`/?q=shirt` server-renders
only matching products).

---

## Performance strategy

- **Streaming SSR with data** → fast, useful first paint; no empty-shell flash.
- **CSS Modules** → zero runtime styling cost, static scoping.
- **Images** dimensioned (`width`/`height`) + `loading="lazy"` (eager + high
  `fetchpriority` on the first row for LCP) → no CLS.
- **BFF cache** (TTL + stale-while-revalidate + single-flight coalescing) → fewer
  upstream calls, no thundering herd.
- **Route-based code splitting** → the Cart route ships as its own chunk.
- **Core Web Vitals** measured client-side (`src/lib/reportWebVitals.ts`); run a
  Lighthouse audit on `npm run preview` for concrete numbers.

> Honest note: XState/Zustand stay in the initial bundle by design — the PLP's
> *Add to cart* and the header badge use the cart store eagerly, so it is on the
> critical path. Code splitting removes what is genuinely Cart-route-specific.

---

## Security

Production-only (relaxed in dev so Vite HMR works): **CSP**
(`default-src 'self'`, `script-src 'self'`, `img-src 'self' https://fakestoreapi.com data:`,
`connect-src 'self'`, `frame-ancestors 'none'`, …), **HSTS**, `X-Frame-Options`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

The hydration state is transported as a **non-executable** `<script type="application/json">`
(with `<` escaped), so a strict `script-src 'self'` needs no inline allowance.
The front only ever talks to the BFF (`connect-src 'self'`), never to FakeStore
directly.

---

## Testing

`npm test` runs a Vitest **workspace** with two environments:
- **node** project — the BFF: upstream-down → clean 5xx with no stack leak, Zod
  validation of upstream payloads, cache TTL / stale-while-revalidate / coalescing,
  route contracts (supertest).
- **jsdom** project — the front: cart optimistic update **and rollback**
  (add/remove/setQuantity), the shared-machine global error surface, pure
  reducers/totals/filter logic, `fetchProducts` Zod validation, search/filter
  behaviour + URL sync, and a populated SSR render.

**109 tests.** The strategy targets the risky boundaries (network failure,
rollback, hydration), not a coverage percentage. There is no browser E2E layer;
user flows are covered by Testing Library integration tests.

---

## Production considerations & edge cases

- **API failure**: the BFF maps upstream errors to clean 5xx (no stack leak); at
  SSR time a prefetch failure still produces a shell (the client retries / shows
  the error state) instead of a hard 500.
- **Malformed upstream data**: rejected by Zod at the BFF, never propagated.
- **Offline / network loss on cart sync**: optimistic update rolls back and the
  failure is announced globally (Retry / Dismiss).
- **Large datasets**: filtering is client-side (small cached catalog); at scale
  it would move to server-side paginated filtering + virtual scrolling.
- **Reproducible builds**: an explicit empty PostCSS config keeps the build
  hermetic (it won't inherit a stray parent/home-level config).

### Known limitations / next steps

- No service worker / offline mode (overlaps the BFF cache; deliberately skipped).
- Web Vitals are reported to the console; a `sendBeacon` to a `/api/vitals`
  endpoint is a documented extension point.
- BFF cache is in-memory (per process); a multi-instance deployment would use a
  shared cache (e.g. Redis).

---

## Development process

Built in reviewable phases with a clean, atomic commit history (foundations →
SSR skeleton → MVP → tests → performance → refactor → features). Several real
bugs were found and fixed along the way (dev-server watch loop, optimistic
double-apply, empty-cart 400, a stale-context lost-add race, a leaking global
PostCSS config) — each is documented with its cause and fix in
[docs/DECISIONS-TECHNIQUES.md](docs/DECISIONS-TECHNIQUES.md) §9.
