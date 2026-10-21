// Runs the model off the main thread, so the UI does not freeze.
import { Classifier, decode } from './classify.ts'

export type Request = { id: number; images: Blob[] }
export type Response =
  | { id: number; kind: 'ready'; provider: string }
  // The calibrated probabilities of each image, in the order they were sent; null for an
  // image that could not be decoded.
  | { id: number; kind: 'result'; perImage: (number[] | null)[] }
  | { id: number; kind: 'error'; message: string }

const base = import.meta.env.BASE_URL
const ready = Classifier.create(base)

ready.then(
  (c) => postMessage({ id: 0, kind: 'ready', provider: c.provider } satisfies Response),
  (e) => postMessage({ id: 0, kind: 'error', message: String(e) } satisfies Response),
)

// One request at a time: the session never runs twice at once.
let queue: Promise<void> = Promise.resolve()

self.onmessage = (event: MessageEvent<Request>) => {
  const { id, images } = event.data
  queue = queue.then(async () => {
    try {
      const classifier = await ready
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
