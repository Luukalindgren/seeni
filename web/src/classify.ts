// The model in the browser (PLAN.md phase 10): decode → preprocess (preprocess.json) →
// onnxruntime-web → logits / T → softmax, per image (the app averages them). Used by the Web Worker and by
// the parity page. Images never leave the device (hard rule 9).
// The WASM-only bundle: its runtime is 14 MB against 27 MB for the WebGPU one, so the first
// load is about a third lighter, and EfficientNet-B0 runs well under a second on WASM.
import * as ort from 'onnxruntime-web/wasm'
// The same file the bundle refers to; fetched here so its download can show progress.
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

import { softmax } from './flow.ts'
import { loadFiles, MODEL_VERSION, type ModelFiles } from './modelFiles.ts'
import { preprocess, type Pixels } from './preprocess.ts'

const MAX_SHORT_SIDE = 1024

/** Bytes downloaded so far, of about `total`. */
export type Progress = (loaded: number, total: number) => void

/** A file that could not be downloaded because of the connection or the server (a network
 * error or HTTP 5xx), not because it is missing: worth trying again. */
export class DownloadError extends Error {}

/** A network error (fetch and stream reads reject with a TypeError) as a DownloadError. */
function retryable(e: unknown, what: string): unknown {
  return e instanceof TypeError ? new DownloadError(`${what}: ${String(e)}`) : e
}

/** The whole file, counting the bytes as they arrive. */
async function download(url: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<Uint8Array> {
  try {
    return await fetchAll(url, onBytes, signal)
  } catch (e) {
    throw retryable(e, url)
  }
}

async function fetchAll(url: string, onBytes: (n: number) => void, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal })
  if (response.status >= 500) throw new DownloadError(`${url}: HTTP ${response.status}`)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onBytes(bytes.length)
    return bytes
  }
  const chunks: Uint8Array[] = []
  let length = 0
  const reader = response.body.getReader()
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    chunks.push(r.value)
    length += r.value.length
    onBytes(r.value.length)
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.length
  }
  return bytes
}

/** Decoded, upright pixels. EXIF orientation is applied, and colour management is off, as
 * PIL does not apply ICC profiles either. */
export async function decode(image: Blob): Promise<Pixels> {
  const options = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as const
  let bitmap = await createImageBitmap(image, { ...options, imageOrientation: 'from-image' })
  // A large phone photo (12–48 MP) is first scaled down by the browser to MAX_SHORT_SIDE,
  // which keeps the canvas and the pixel copies within mobile memory and canvas limits.
  // The exact resize to the model size follows in preprocess(). This is a reduction of at
  // most a few times with high-quality filtering, not the aliasing 4000 → 256 jump of #14;
  // the fixtures are 512 px and never take this path.
  const short = Math.min(bitmap.width, bitmap.height)
  if (short > MAX_SHORT_SIDE) {
    const scale = MAX_SHORT_SIDE / short
    const resized = await createImageBitmap(bitmap, {
      ...options,
      resizeWidth: Math.round(bitmap.width * scale),
      resizeHeight: Math.round(bitmap.height * scale),
      resizeQuality: 'high',
    })
    bitmap.close()
    bitmap = resized
  }
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('no 2d context')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  return { data, width: canvas.width, height: canvas.height, channels: 4 }
}

export class Classifier {
  readonly files: ModelFiles
  readonly provider: string
  private readonly session: ort.InferenceSession

  private constructor(files: ModelFiles, session: ort.InferenceSession, provider: string) {
    this.files = files
    this.session = session
    this.provider = provider
  }

  /** Create the session once and do one warm-up run. */
  static async create(base: string, providers: string[] = ['wasm'], onProgress?: Progress): Promise<Classifier> {
    // GitHub Pages sends no cross-origin isolation headers, so threads are not available.
    ort.env.wasm.numThreads = 1
    // The runtime (.wasm) and the model are downloaded here, not by onnxruntime, to count the
    // bytes; the runtime goes in as wasmBinary. Vite copies the .wasm into the build, so the
    // app serves it itself, which offline needs (never a CDN).
    let loaded = 0
    let settled = false
    const counted = (n: number) => {
      if (!settled) onProgress?.((loaded += n), __LOAD_BYTES__)
    }
    // When one download fails, the other one stops too, so that a new try does not compete
    // with it for the connection.
    const abort = new AbortController()
    const [files, wasm, model] = await Promise.all([
      loadFiles(base).catch((e: unknown) => {
        throw retryable(e, 'labels.json, preprocess.json, calibration.json')
      }),
      download(wasmUrl, counted, abort.signal),
      download(`${base}models/${MODEL_VERSION}/model.onnx`, counted, abort.signal),
    ])
      .catch((e: unknown) => {
        abort.abort()
        throw e
      })
      .finally(() => (settled = true))
    ort.env.wasm.wasmBinary = wasm
    let lastError: unknown
    for (const provider of providers) {
      try {
        const session = await ort.InferenceSession.create(model, { executionProviders: [provider] })
        const classifier = new Classifier(files, session, provider)
        const crop = files.preprocess.centerCrop
        await classifier.logits([new Float32Array(3 * crop * crop)])
        // The runtime is compiled; the bytes need not stay in memory.
        ort.env.wasm.wasmBinary = undefined
        return classifier
      } catch (e) {
        lastError = e
      }
    }
    ort.env.wasm.wasmBinary = undefined
    throw lastError
  }

  /** Raw logits, one row per input tensor (1×3×crop×crop each). */
  async logits(inputs: Float32Array[]): Promise<number[][]> {
    const crop = this.files.preprocess.centerCrop
    const size = 3 * crop * crop
    const batch = new Float32Array(inputs.length * size)
    inputs.forEach((x, i) => batch.set(x, i * size))
    const feeds = { input: new ort.Tensor('float32', batch, [inputs.length, 3, crop, crop]) }
    const output = await this.session.run(feeds)
    const logits = output['logits']
    if (!logits) throw new Error('the model has no output `logits`')
    const values = Array.from(logits.data as Float32Array)
    const n = this.files.labels.length
    return inputs.map((_, i) => values.slice(i * n, (i + 1) * n))
  }

  /** Calibrated probabilities of each image. */
  async classifyEach(images: Pixels[]): Promise<number[][]> {
    const inputs = images.map((p) => preprocess(p, this.files.preprocess))
    const logits = await this.logits(inputs)
    const t = this.files.calibration.temperature
    return logits.map((row) => softmax(row, t))
  }
}
