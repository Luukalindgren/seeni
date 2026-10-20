// The model's JSON files (#8). Kept apart from classify.ts, so the main thread can read
// them without loading onnxruntime-web.
import type { Calibration, Label } from './flow.ts'
import type { PreprocessSpec } from './preprocess.ts'

export const MODEL_VERSION = 'v1'

export interface ModelFiles {
  labels: Label[]
  preprocess: PreprocessSpec
  calibration: Calibration
}

export async function loadFiles(base: string): Promise<ModelFiles> {
  const get = async (name: string) => {
    const response = await fetch(`${base}models/${MODEL_VERSION}/${name}`)
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
    return response.json()
  }
  const [labels, preprocess, calibration] = await Promise.all([
    get('labels.json'),
    get('preprocess.json'),
    get('calibration.json'),
  ])
  return { labels, preprocess, calibration }
}
