// Runs the model off the main thread, so the UI does not freeze.
import { Classifier, decode, DownloadError } from './classify.ts'

export type Request = { id: number; images: Blob[] }
export type Response =
  | { id: number; kind: 'ready'; provider: string }
  // While the model loads: the share downloaded, 0–99 (100 only once ready).
  | { id: number; kind: 'progress'; percent: number }
  // The calibrated probabilities of each image, in the order they were sent; null for an
  // image that could not be decoded.
  | { id: number; kind: 'result'; perImage: (number[] | null)[] }
  | { id: number; kind: 'error'; message: string }

const base = import.meta.env.BASE_URL
// At most one progress message per percent.
let shown = -1

function load(): Promise<Classifier> {
  shown = -1
  const loading = Classifier.create(base, ['wasm'], (loaded, total) => {
    // Never 100 % before ready: the model still has to start after the download.
    const percent = Math.min(99, Math.floor((100 * loaded) / total))
    if (percent === shown) return
    shown = percent
    postMessage({ id: 0, kind: 'progress', percent } satisfies Response)
  })
  loading.then(
    (c) => postMessage({ id: 0, kind: 'ready', provider: c.provider } satisfies Response),
    (e) => postMessage({ id: 0, kind: 'error', message: String(e) } satisfies Response),
  )
  return loading
}

// A download that broke off (a dropped connection on the first visit) is tried again when
// the next photo comes in, instead of failing every photo until the page is reloaded. Any
// other failure (the runtime or the model would not start) stays: trying again would only
// download everything again for the same error.
let ready: Promise<Classifier> | null = null
function classifier(): Promise<Classifier> {
  return (ready ??= load().catch((e: unknown) => {
    if (e instanceof DownloadError) ready = null
    throw e
  }))
}
classifier().catch(() => undefined)

// One request at a time: the session never runs twice at once.
let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, images } = event.data
  queue = queue.then(async () => {
    try {
      // A failed download starts again here (see classifier()).
      const model = await classifier().catch(() => classifier())
      // A file that is not an image (or not in a format the browser reads) is left out,
      // so one bad file among several photos does not fail them all.
      const pixels = []
      for (const image of images) pixels.push(await decode(image).catch(() => null))
      const decoded = pixels.filter((p) => p !== null)
      const probabilities = decoded.length > 0 ? await model.classifyEach(decoded) : []
      const perImage = pixels.map((p) => (p === null ? null : probabilities.shift()!))
      postMessage({ id, kind: 'result', perImage } satisfies Response)
    } catch (e) {
      postMessage({ id, kind: 'error', message: String(e) } satisfies Response)
    }
  })
}
