// Parity page (#10, #14): runs the golden fixture images through the app's real decoding,
// preprocessing and model in the browser, and exposes the results for Playwright.
import { Classifier, decode } from './classify.ts'
import { readNpy } from './npy.ts'
import { preprocess } from './preprocess.ts'

interface Golden {
  temperature: number
  tensors: string[]
  images: { file: string; top5: { index: number; logit: number; probability: number }[] }[]
}

export interface ParityResult {
  file: string
  logits: number[]
  // Largest difference to Python's input tensor, when the fixtures have one.
  tensorMaxDiff: number | null
}

declare global {
  interface Window {
    parity?: { ok: true; results: ParityResult[] } | { ok: false; error: string }
  }
}

const base = import.meta.env.BASE_URL
const fixtures = `${base}tests/fixtures/`

async function bytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(fixtures + path)
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function run(): Promise<ParityResult[]> {
  const golden: Golden = JSON.parse(new TextDecoder().decode(await bytes('golden.json')))
  // WASM only: headless CI browsers have no WebGPU, and the goldens are WASM-comparable.
  const classifier = await Classifier.create(base, ['wasm'])
  const results: ParityResult[] = []
  for (const g of golden.images) {
    const pixels = await decode(new Blob([await bytes(g.file)], { type: 'image/jpeg' }))
    const x = preprocess(pixels, classifier.files.preprocess)
    const [logits] = await classifier.logits([x])
    const tensor = g.file.replace('images/', 'tensors/').replace(/\.jpg$/, '.npy')
    let tensorMaxDiff: number | null = null
    if (golden.tensors.includes(tensor)) {
      const expected = readNpy(await bytes(tensor)).data
      tensorMaxDiff = 0
      for (let i = 0; i < x.length; i++) tensorMaxDiff = Math.max(tensorMaxDiff, Math.abs(x[i]! - expected[i]!))
    }
    results.push({ file: g.file, logits: logits!, tensorMaxDiff })
  }
  return results
}

const out = document.querySelector('#out')!
run().then(
  (results) => {
    window.parity = { ok: true, results }
    out.textContent = JSON.stringify(results.map((r) => [r.file, r.tensorMaxDiff]), null, 1)
  },
  (e) => {
    window.parity = { ok: false, error: String(e) }
    out.textContent = String(e)
  },
)
