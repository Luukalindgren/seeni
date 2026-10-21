// Runs the model off the main thread, so the UI does not freeze.
import { Classifier, decode } from './classify.ts'

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
let failed = false

function load(): Promise<Classifier> {
  shown = -1
  failed = false
  const loading = Classifier.create(base, ['wasm'], (loaded, total) => {
    // Never 100 % before ready: the model still has to start after the download.
    const percent = Math.min(99, Math.floor((100 * loaded) / total))
    if (percent === shown) return
    shown = percent
    postMessage({ id: 0, kind: 'progress', percent } satisfies Response)
  })
  loading.then(
    (c) => postMessage({ id: 0, kind: 'ready', provider: c.provider } satisfies Response),
    (e) => {
      failed = true
      postMessage({ id: 0, kind: 'error', message: String(e) } satisfies Response)
    },
  )
  return loading
}

// A load that failed, e.g. when the connection dropped during the first download, is tried
// again when the connection returns and when a photo comes in, instead of failing every photo
// until the page is reloaded.
let ready = load()
self.addEventListener('online', () => {
  if (failed) ready = load()
})

// One request at a time: the session never runs twice at once.
let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, images } = event.data
  queue = queue.then(async () => {
    try {
      let classifier: Classifier
      try {
        classifier = await ready
      } catch {
        // Once more, unless the connection's return already started a new load.
        if (failed) ready = load()
        classifier = await ready
      }
      // A file that is not an image (or not in a format the browser reads) is left out,
      // so one bad file among several photos does not fail them all.
      const pixels = []
      for (const image of images) pixels.push(await decode(image).catch(() => null))
      const decoded = pixels.filter((p) => p !== null)
      const probabilities = decoded.length > 0 ? await classifier.classifyEach(decoded) : []
      const perImage = pixels.map((p) => (p === null ? null : probabilities.shift()!))
      postMessage({ id, kind: 'result', perImage } satisfies Response)
    } catch (e) {
      postMessage({ id, kind: 'error', message: String(e) } satisfies Response)
    }
  })
}
