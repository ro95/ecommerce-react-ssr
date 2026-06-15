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
  /**
   * Markup to inject in place of `<!--app-head-->` (preload links, dehydrated
   * query state as a non-executed `<script type="application/json">`, etc.).
   * Produced by the front before streaming starts, so it can go into the head
   * chunk we flush on `onShellReady`.
   */
  headTags: string
}

export interface RenderOptions {
  /** `${protocol}://${host}` of the incoming request, forwarded to the app so
   * server-side data fetching can build absolute URLs to our own BFF. */
  origin: string
  callbacks: RenderCallbacks
}

export type RenderFn = (url: string, opts: RenderOptions) => Promise<RenderResult>

/** Marker that splits the HTML shell into the part before and after the app root. */
const APP_HTML_MARKER = '<!--app-html-->'
/** Marker in the head, replaced by the render's `headTags` before flushing. */
const APP_HEAD_MARKER = '<!--app-head-->'

/**
 * Abort the React stream if the shell isn't ready within this window. Protects
 * against a render that hangs (e.g. a suspended boundary that never resolves).
 */
const STREAM_ABORT_TIMEOUT_MS = 10_000

interface StreamOptions {
  url: string
  /** `${protocol}://${host}` of the request, forwarded to the render. */
  origin: string
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
export async function renderToResponse({
  url,
  origin,
  template,
  render,
  res,
  fixStacktrace,
}: StreamOptions): Promise<void> {
  const markerIndex = template.indexOf(APP_HTML_MARKER)
  if (markerIndex === -1) {
    throw new Error(
      `SSR template is missing the "${APP_HTML_MARKER}" marker; cannot stream.`,
    )
  }

  const rawHead = template.slice(0, markerIndex)
  const htmlTail = template.slice(markerIndex + APP_HTML_MARKER.length)

  // True once the shell is flushed and we can no longer change the status code.
  let shellFlushed = false
  // Holds the streamer once `await render` resolves. `renderToPipeableStream`
  // runs inside the async `render`, so React's callbacks may fire (in a
  // microtask) before the streamer is in hand here. The callbacks read it via
  // this ref rather than closing over a binding, so an `onShellReady` that fires
  // during the await is deferred and replayed once the streamer is available.
  const ref: { streamer: RenderResult | undefined } = { streamer: undefined }
  // Set if `onShellReady` fired before the streamer was available; replayed below.
  let pendingShellReady = false

  /** Flush the head (with headTags injected) and pipe React's stream out. */
  const flushShell = (streamer: RenderResult): void => {
    shellFlushed = true
    // Inject headTags in place of the head marker now that the render has
    // produced them (preload hints, dehydrated query state, ...). Done here,
    // not at split time, because headTags is only known after `render`.
    const htmlHead = rawHead.replace(APP_HEAD_MARKER, streamer.headTags)
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

    streamer.pipe(transformStream)
  }

  // `render` is async (v2 contract): it resolves the streamer AND the `headTags`
  // to inject before we flush the head. Awaiting it here means a failure to even
  // start the render rejects this promise and is handled by the caller's
  // try/catch BEFORE any byte is sent — we still own the status line.
  ref.streamer = await render(url, {
    origin,
    callbacks: {
      onShellReady: () => {
        // If the streamer isn't in hand yet (callback fired during the await),
        // record intent and replay once it's set, just after this await.
        if (ref.streamer) {
          flushShell(ref.streamer)
        } else {
          pendingShellReady = true
        }
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
    },
  })

  // The streamer is now in hand (the await resolved). Narrow to a non-nullable
  // local so the post-await teardown handlers don't need to re-check. The guard
  // is unreachable in practice (a resolved `render` returns the streamer) but
  // keeps us honest under strict null checks without an `as`/non-null assertion.
  const streamer = ref.streamer
  if (!streamer) {
    throw new Error('SSR render resolved without a streamer; cannot continue.')
  }

  // Replay a shell-ready that fired before the streamer was assigned.
  if (pendingShellReady && !shellFlushed) {
    flushShell(streamer)
  }

  // Abort guard: if the shell never becomes ready, tear the render down so we
  // don't leak a hanging request/stream.
  const abortTimer = setTimeout(() => {
    if (!shellFlushed) {
      streamer.abort()
    }
  }, STREAM_ABORT_TIMEOUT_MS)

  // Clear the timer once the response settles, and abort the render if the
  // client disconnects mid-stream.
  res.on('close', () => {
    clearTimeout(abortTimer)
    if (!res.writableEnded) {
      streamer.abort()
    }
  })
  res.on('finish', () => {
    clearTimeout(abortTimer)
  })
}
