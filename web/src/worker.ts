// Runs the model off the main thread, so the UI does not freeze.
import { Classifier, decode } from './classify.ts'

export type Request = { id: number; images: Blob[] }
export type Response =
  | { id: number; kind: 'ready'; provider: string }
  | { id: number; kind: 'result'; probabilities: number[] }
  | { id: number; kind: 'error'; message: string }

const base = import.meta.env.BASE_URL
const ready = Classifier.create(base)

ready.then(
  (c) => postMessage({ id: 0, kind: 'ready', provider: c.provider } satisfies Response),
  (e) => postMessage({ id: 0, kind: 'error', message: String(e) } satisfies Response),
)

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, images } = event.data
  try {
    const classifier = await ready
    const pixels = []
    for (const image of images) pixels.push(await decode(image))
    const probabilities = await classifier.classify(pixels)
    postMessage({ id, kind: 'result', probabilities } satisfies Response)
  } catch (e) {
    postMessage({ id, kind: 'error', message: String(e) } satisfies Response)
  }
}
