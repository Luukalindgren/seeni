// Runs the model off the main thread, so the UI does not freeze.
import { Classifier, decode } from './classify.ts'

export type Request = { id: number; images: Blob[] }
export type Response =
  | { id: number; kind: 'ready'; provider: string }
  // The calibrated probabilities of each image, in the order they were sent.
  | { id: number; kind: 'result'; perImage: number[][] }
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
      const pixels = []
      for (const image of images) pixels.push(await decode(image))
      const perImage = await classifier.classifyEach(pixels)
      postMessage({ id, kind: 'result', perImage } satisfies Response)
    } catch (e) {
      postMessage({ id, kind: 'error', message: String(e) } satisfies Response)
    }
  })
}
