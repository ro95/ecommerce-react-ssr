/**
 * Express SSR server — entry point.
 *
 * One server, two modes selected via `NODE_ENV`:
 *  - development: Vite in middleware mode (HMR), template read + transformed per
 *    request, `render` resolved through `vite.ssrLoadModule` (so source edits are
 *    picked up without a restart).
 *  - production: static assets served from `dist/client`, the built template read
 *    once at boot, `render` imported from the built SSR bundle in `dist/server`.
 *
 * The streaming logic itself is shared (see ./ssr.ts) so dev and prod cannot drift.
 *
 * Run via Node's native TS type-stripping (`node --watch server/index.ts`): no
 * non-strippable TS features (enum/namespace/parameter-properties) are used here.
 */
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import express from 'express'
import type { Express, Request, Response, NextFunction } from 'express'
import type { ViteDevServer } from 'vite'
import { renderToResponse } from './ssr.ts'
import type { RenderFn } from './ssr.ts'
import { createBffRouter } from './bff/router.ts'
import { securityHeaders } from './security.ts'

/** `${protocol}://${host}` for the current request — forwarded to the renderer
 * so server-side data fetching can build absolute URLs to our own BFF. */
function originOf(req: Request): string {
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const isProduction = process.env.NODE_ENV === 'production'
const PORT = Number(process.env.PORT) || 5173
const BASE = '/'

/** Path to the SSR entry, as understood by each mode's module loader. */
const SSR_ENTRY_DEV = '/src/entry-server.tsx'
const SSR_ENTRY_PROD = path.resolve(ROOT, 'dist/server/entry-server.js')

const CLIENT_DIST = path.resolve(ROOT, 'dist/client')
const PROD_TEMPLATE_PATH = path.resolve(CLIENT_DIST, 'index.html')
const DEV_TEMPLATE_PATH = path.resolve(ROOT, 'index.html')

async function createDevServer(app: Express): Promise<ViteDevServer> {
  const { createServer } = await import('vite')
  const vite = await createServer({
    root: ROOT,
    base: BASE,
    appType: 'custom',
    server: { middlewareMode: true },
  })
  // Vite owns asset transforms, HMR and module graph in dev.
  app.use(vite.middlewares)
  return vite
}

async function configureProductionAssets(app: Express): Promise<void> {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  // sirv calls `next()` when no static file matches, so navigations (e.g. "/")
  // fall through to the SSR handler instead of being served the raw shell.
  app.use(BASE, sirv(CLIENT_DIST, { extensions: [] }))
}

/**
 * In dev, the SSR module is re-resolved per request via Vite so edits to the
 * entry (or anything it imports) are reflected immediately and stack traces are
 * fixed against the original source.
 */
function createDevHandler(vite: ViteDevServer) {
  // Express ignores a handler's return value, so we keep the public handler
  // synchronous (void) and run the async work in a self-contained task whose
  // rejection is funnelled to `next` — avoids an unhandled promise at the
  // middleware boundary (no-misused-promises).
  return (req: Request, res: Response, next: NextFunction): void => {
    const url = req.originalUrl.replace(BASE, '/')
    void (async () => {
      try {
        const rawTemplate = await fs.readFile(DEV_TEMPLATE_PATH, 'utf-8')
        const template = await vite.transformIndexHtml(url, rawTemplate)
        const mod = await vite.ssrLoadModule(SSR_ENTRY_DEV)
        const render = (mod as { render: RenderFn }).render

        await renderToResponse({
          url,
          origin: originOf(req),
          template,
          render,
          res,
          fixStacktrace: (error) => {
            if (error instanceof Error) vite.ssrFixStacktrace(error)
          },
        })
      } catch (error) {
        // Synchronous failure (template read, transform, module load): the stream
        // hasn't started, so we can still respond cleanly. Let Vite rewrite the
        // stack against source, then hand to the error middleware.
        if (error instanceof Error) vite.ssrFixStacktrace(error)
        next(error)
      }
    })()
  }
}

/**
 * In prod, template and `render` are resolved once at boot and reused, so the
 * per-request handler only does the streaming work.
 */
function createProdHandler(template: string, render: RenderFn) {
  // `renderToResponse` is async (the render itself is awaited), so we run it in a
  // self-contained task and funnel any rejection to `next` — mirroring the dev
  // handler and avoiding an unhandled promise at the middleware boundary.
  return (req: Request, res: Response, next: NextFunction): void => {
    const url = req.originalUrl.replace(BASE, '/')
    void (async () => {
      try {
        await renderToResponse({ url, origin: originOf(req), template, render, res })
      } catch (error) {
        next(error)
      }
    })()
  }
}

async function createServer(): Promise<Express> {
  const app = express()
  // Streaming HTML is not buffered by an upstream proxy in this setup; disable
  // ETag so partial responses aren't cached/compared as full documents.
  app.disable('x-powered-by')
  app.disable('etag')

  // Security headers first so EVERY response (BFF, assets, SSR) inherits them.
  // No-op in dev (Vite HMR needs inline/eval); enforced in prod. See ./security.ts.
  app.use(securityHeaders(isProduction))

  // BFF mounted on /api BEFORE any mode-specific middleware (Vite in dev, static
  // in prod) and before the SSR catch-all, so /api never falls through to module
  // transforms or HTML rendering. `express.json()` is scoped to /api so SSR and
  // asset requests aren't needlessly body-parsed. The BFF is fully independent of
  // the React render — it works even if SSR is mid-migration.
  app.use('/api', express.json({ limit: '64kb' }), createBffRouter())
  // BFF-scoped error boundary: a malformed JSON body makes `express.json()` throw
  // a SyntaxError. Catch it HERE so /api always answers JSON (400), instead of
  // falling through to the SSR/HTML 500 boundary below. A payload over the limit
  // surfaces as 413. Anything else is an opaque 500 (no internals leaked).
  app.use(
    '/api',
    (error: unknown, _req: Request, res: Response, next: NextFunction): void => {
      if (res.headersSent) {
        next(error)
        return
      }
      const status = (error as { status?: number; type?: string } | null)?.status
      if (error instanceof SyntaxError || status === 400) {
        res.status(400).json({ error: 'bad_request', message: 'Malformed JSON body' })
        return
      }
      if (status === 413) {
        res.status(413).json({ error: 'payload_too_large', message: 'Payload too large' })
        return
      }
      console.error('[bff] middleware error:', error)
      res.status(500).json({ error: 'internal_error', message: 'Internal Server Error' })
    },
  )

  let ssrHandler: (req: Request, res: Response, next: NextFunction) => void

  if (isProduction) {
    await configureProductionAssets(app)
    const template = await fs.readFile(PROD_TEMPLATE_PATH, 'utf-8')
    const mod = (await import(SSR_ENTRY_PROD)) as { render: RenderFn }
    ssrHandler = createProdHandler(template, mod.render)
  } else {
    const vite = await createDevServer(app)
    ssrHandler = createDevHandler(vite)
  }

  // Catch-all SSR route (Express 4: bare `app.use` matches every remaining
  // request, after Vite/static middleware). We only stream HTML for navigations
  // (GET/HEAD); other verbs get a 405 rather than an unrendered document.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).set({ Allow: 'GET, HEAD' }).end('Method Not Allowed')
      return
    }
    ssrHandler(req, res, next)
  })

  // Final error boundary: never leak a stack trace to the client.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[server] unhandled error:', error)
    if (!res.headersSent) {
      res
        .status(500)
        .set({ 'Content-Type': 'text/html; charset=utf-8' })
        .end('<!doctype html><h1>500 — Internal Server Error</h1>')
    } else if (!res.writableEnded) {
      res.end()
    }
  })

  return app
}

createServer()
  .then((app) => {
    app.listen(PORT, () => {
      const mode = isProduction ? 'production' : 'development'
      console.log(`[server] (${mode}) ready at http://localhost:${PORT}`)
    })
  })
  .catch((error: unknown) => {
    console.error('[server] failed to start:', error)
    process.exit(1)
  })
