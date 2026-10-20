// The model in the browser (PLAN.md phase 10): decode → preprocess (preprocess.json) →
// onnxruntime-web → logits / T → softmax → mean over images. Used by the Web Worker and by
// the parity page. Images never leave the device (hard rule 9).
import * as ort from 'onnxruntime-web/webgpu'

import { averageProbabilities, softmax } from './flow.ts'
import { loadFiles, MODEL_VERSION, type ModelFiles } from './modelFiles.ts'
import { preprocess, type Pixels } from './preprocess.ts'

/** Decoded, upright pixels. EXIF orientation is applied, and colour management is off, as
 * PIL does not apply ICC profiles either. */
export async function decode(image: Blob): Promise<Pixels> {
  const bitmap = await createImageBitmap(image, {
    imageOrientation: 'from-image',
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  })
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

  /** Create the session once and do one warm-up run. WebGPU first, WASM as the fallback. */
  static async create(base: string, providers: string[] = ['webgpu', 'wasm']): Promise<Classifier> {
    // The webgpu bundle refers to its .wasm with new URL(..., import.meta.url), so Vite
    // copies it into the build and the app serves it itself, which offline needs. No
    // wasmPaths: the default points at that copy, not at a CDN.
    // GitHub Pages sends no cross-origin isolation headers, so threads are not available.
    ort.env.wasm.numThreads = 1
    const files = await loadFiles(base)
    const model = `${base}models/${MODEL_VERSION}/model.onnx`
    let lastError: unknown
    for (const provider of providers) {
      try {
        const session = await ort.InferenceSession.create(model, { executionProviders: [provider] })
        const classifier = new Classifier(files, session, provider)
        const crop = files.preprocess.centerCrop
        await classifier.logits([new Float32Array(3 * crop * crop)])
        return classifier
      } catch (e) {
        lastError = e
      }
    }
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

  /** Calibrated probabilities averaged over the images of one mushroom. */
  async classify(images: Pixels[]): Promise<number[]> {
    const inputs = images.map((p) => preprocess(p, this.files.preprocess))
    const logits = await this.logits(inputs)
    const t = this.files.calibration.temperature
    return averageProbabilities(logits.map((row) => softmax(row, t)))
  }
}
