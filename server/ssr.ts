/**
 * Streaming SSR core — mode-agnostic.
 *
 * Both dev and prod resolve a `template` (the index.html with the `<!--app-html-->`
 * marker) and a `render` function (from `src/entry-server.tsx`), then funnel into
 * the exact same streaming pipeline. Keeping this logic in one place avoids the
 * classic dev/prod drift where the two paths diverge subtly.
 */
import { PassThrough } from 'node:stream'
import type { Response } from 'express'

/**
 * SSR contract exposed by `src/entry-server.tsx`. Kept in sync with the front
 * agent's implementation; the server only depends on this shape, never on the
 * concrete module type, so dev (ssrLoadModule) and prod (built bundle) share it.
 */
export interface RenderCallbacks {
  onShellReady: () => void
  onShellError: (error: unknown) => void
  onAllReady: () => void
  onError: (error: unknown) => void
}

export interface RenderResult {
  pipe: (writable: NodeJS.WritableStream) => void
  abort: () => void
}

export type RenderFn = (url: string, callbacks: RenderCallbacks) => RenderResult

/** Marker that splits the HTML shell into the part before and after the app root. */
const APP_HTML_MARKER = '<!--app-html-->'

/**
 * Abort the React stream if the shell isn't ready within this window. Protects
 * against a render that hangs (e.g. a suspended boundary that never resolves).
 */
const STREAM_ABORT_TIMEOUT_MS = 10_000

interface StreamOptions {
  url: string
  /** Full index.html template, already transformed (dev) or read from disk (prod). */
  template: string
  render: RenderFn
  res: Response
  /**
   * Dev-only hook to fix the stack trace of an error against the original source
   * (Vite's `ssrFixStacktrace`). No-op in prod.
   */
  fixStacktrace?: (error: unknown) => void
}

/**
 * Render `url` to the response as a streamed HTML document.
 *
 * Flow:
 *  1. Split the template on `<!--app-html-->` into head/tail.
 *  2. On `onShellReady`: send 200 + the head, then pipe the React stream into a
 *     PassThrough that forwards chunks to `res` (preserving backpressure) and
 *     writes the tail when the stream ends.
 *  3. `onShellError` (the shell itself failed) → 500, nothing has been sent yet.
 *  4. `onError` after the shell is flushed → log only; the status line is committed.
 */
export function renderToResponse({
  url,
  template,
  render,
  res,
  fixStacktrace,
}: StreamOptions): void {
  const markerIndex = template.indexOf(APP_HTML_MARKER)
  if (markerIndex === -1) {
    throw new Error(
      `SSR template is missing the "${APP_HTML_MARKER}" marker; cannot stream.`,
    )
  }

  const htmlHead = template.slice(0, markerIndex)
  const htmlTail = template.slice(markerIndex + APP_HTML_MARKER.length)

  // True once the shell is flushed and we can no longer change the status code.
  let shellFlushed = false

  const result = render(url, {
    onShellReady: () => {
      shellFlushed = true
      res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' })
      res.write(htmlHead)

      // PassThrough sits between React's pipeable stream and the response so we
      // can append the tail on stream end without breaking backpressure: we keep
      // the response open (`end: false`) and close it ourselves after the tail.
      const transformStream = new PassThrough()
      transformStream.pipe(res, { end: false })
      transformStream.on('end', () => {
        res.end(htmlTail)
      })
      transformStream.on('error', (error: unknown) => {
        console.error('[ssr] stream error after shell flush:', error)
        if (!res.writableEnded) {
          res.end()
        }
      })

      result.pipe(transformStream)
    },

    onShellError: (error: unknown) => {
      fixStacktrace?.(error)
      // Shell failed before any bytes were sent: we still own the status line.
      if (!res.headersSent) {
        res
          .status(500)
          .set({ 'Content-Type': 'text/html; charset=utf-8' })
          .end('<!doctype html><h1>500 — Internal Server Error</h1>')
      } else if (!res.writableEnded) {
        res.end()
      }
      console.error('[ssr] shell render failed:', error)
    },

    onAllReady: () => {
      // No-op for the streaming path: the shell already started piping. Hook kept
      // explicit so the contract is fully honored and trivial to extend later
      // (e.g. crawler/bot mode that buffers the whole document before sending).
    },

    onError: (error: unknown) => {
      fixStacktrace?.(error)
      // Before the shell, onShellError also fires and owns the 500. After the
      // shell, the response is already committed — log only, never re-send.
      if (shellFlushed) {
        console.error(
          '[ssr] error after shell flush (stream already started):',
          error,
        )
      } else {
        console.error('[ssr] error during render:', error)
      }
    },
  })

  // Abort guard: if the shell never becomes ready, tear the render down so we
  // don't leak a hanging request/stream.
  const abortTimer = setTimeout(() => {
    if (!shellFlushed) {
      result.abort()
    }
  }, STREAM_ABORT_TIMEOUT_MS)

  // Clear the timer once the response settles, and abort the render if the
  // client disconnects mid-stream.
  res.on('close', () => {
    clearTimeout(abortTimer)
    if (!res.writableEnded) {
      result.abort()
    }
  })
  res.on('finish', () => {
    clearTimeout(abortTimer)
  })
}
