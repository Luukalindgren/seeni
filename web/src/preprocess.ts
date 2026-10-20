// Image preprocessing for the model (hard rule 4, #14). The steps and values come from the
// model's preprocess.json, written by training/src/seeni/preprocess.py; nothing is
// hardcoded here. The resize is done on the decoded pixels in plain integer arithmetic,
// matching PIL's antialiased bilinear resample (Pillow's Resample.c) exactly, instead of
// relying on canvas scaling, which differs between browsers.

export interface PreprocessSpec {
  exifOrientation: boolean
  colorSpace: 'RGB'
  resize: { shorterSide: number; interpolation: string; antialias: boolean }
  centerCrop: number
  scale: number
  mean: number[]
  std: number[]
  layout: 'NCHW'
  dtype: 'float32'
}

/** Decoded pixels, upright (EXIF orientation already applied), 3 (RGB) or 4 (RGBA) bytes
 * per pixel, row by row. ImageData from a canvas is RGBA. */
export interface Pixels {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  channels: 3 | 4
}

// Pillow's fixed-point precision for 8-bit images.
const PRECISION_BITS = 32 - 8 - 2
const ONE = 2 ** PRECISION_BITS

interface Coefficients {
  start: number[]
  weights: number[][]
}

/** Pillow's precompute_coeffs + normalize_coeffs_8bpc for the bilinear filter. */
function coefficients(inSize: number, outSize: number): Coefficients {
  const scale = inSize / outSize
  const filterScale = Math.max(scale, 1)
  const support = 1 * filterScale // bilinear support is 1
  const start: number[] = []
  const weights: number[][] = []
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0)
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin
    const k: number[] = []
    let sum = 0
    for (let x = 0; x < xmax; x++) {
      const t = Math.abs((x + xmin - center + 0.5) / filterScale)
      const w = t < 1 ? 1 - t : 0
      k.push(w)
      sum += w
    }
    weights.push(
      k.map((w) => {
        const v = sum !== 0 ? w / sum : w
        return v < 0 ? Math.trunc(-0.5 + v * ONE) : Math.trunc(0.5 + v * ONE)
      }),
    )
    start.push(xmin)
  }
  return { start, weights }
}

function clip8(v: number): number {
  if (v >= ONE * 256) return 255
  if (v <= 0) return 0
  return Math.floor(v / ONE)
}

/** One resampling pass along x of an RGB image (3 bytes per pixel). */
function resampleRows(src: Uint8Array, width: number, height: number, outWidth: number): Uint8Array {
  const { start, weights } = coefficients(width, outWidth)
  const out = new Uint8Array(outWidth * height * 3)
  for (let y = 0; y < height; y++) {
    const row = y * width * 3
    for (let xx = 0; xx < outWidth; xx++) {
      const k = weights[xx]!
      const x0 = start[xx]!
      for (let c = 0; c < 3; c++) {
        let ss = ONE / 2
        for (let i = 0; i < k.length; i++) ss += src[row + (x0 + i) * 3 + c]! * k[i]!
        out[(y * outWidth + xx) * 3 + c] = clip8(ss)
      }
    }
  }
  return out
}

function transpose(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) out[(x * height + y) * 3 + c] = src[(y * width + x) * 3 + c]!
    }
  }
  return out
}

function toRgb(p: Pixels): Uint8Array {
  if (p.channels === 3) return Uint8Array.from(p.data)
  const out = new Uint8Array(p.width * p.height * 3)
  for (let i = 0, j = 0; i < p.data.length; i += 4, j += 3) {
    out[j] = p.data[i]!
    out[j + 1] = p.data[i + 1]!
    out[j + 2] = p.data[i + 2]!
  }
  return out
}

/** PIL's Image.resize(size, BILINEAR): horizontal pass first, then vertical, with 8-bit
 * rounding in between, as Pillow does. Returns RGB bytes. */
export function resizeBilinear(p: Pixels, outWidth: number, outHeight: number): Uint8Array {
  let data = toRgb(p)
  if (outWidth !== p.width) data = resampleRows(data, p.width, p.height, outWidth)
  if (outHeight !== p.height) {
    const t = resampleRows(transpose(data, outWidth, p.height), p.height, outWidth, outHeight)
    data = transpose(t, outHeight, outWidth)
  }
  return data
}

/** torchvision Resize(n) on a PIL image: the shorter side becomes n, the longer one is
 * truncated, int(n * long / short). */
export function resizedSize(width: number, height: number, shorterSide: number): [number, number] {
  if (width <= height) return [shorterSide, Math.trunc((shorterSide * height) / width)]
  return [Math.trunc((shorterSide * width) / height), shorterSide]
}

/** Python's round(): halves go to the even neighbour, as torchvision's CenterCrop uses. */
function roundHalfEven(x: number): number {
  const f = Math.floor(x)
  const d = x - f
  if (d > 0.5) return f + 1
  if (d < 0.5) return f
  return f % 2 === 0 ? f : f + 1
}

/** The model input for one image: 1×3×crop×crop float32 in NCHW order. */
export function preprocess(p: Pixels, spec: PreprocessSpec): Float32Array {
  if (spec.resize.interpolation !== 'bilinear' || !spec.resize.antialias) {
    throw new Error(`unsupported resize ${JSON.stringify(spec.resize)}`)
  }
  if (spec.colorSpace !== 'RGB' || spec.layout !== 'NCHW' || spec.dtype !== 'float32') {
    throw new Error('unsupported preprocess.json')
  }
  const [w, h] = resizedSize(p.width, p.height, spec.resize.shorterSide)
  const rgb = resizeBilinear(p, w, h)
  const crop = spec.centerCrop
  const top = roundHalfEven((h - crop) / 2)
  const left = roundHalfEven((w - crop) / 2)
  const out = new Float32Array(3 * crop * crop)
  for (let c = 0; c < 3; c++) {
    const mean = spec.mean[c]!
    const std = spec.std[c]!
    for (let y = 0; y < crop; y++) {
      for (let x = 0; x < crop; x++) {
        const v = rgb[((top + y) * w + left + x) * 3 + c]!
        out[(c * crop + y) * crop + x] = (v * spec.scale - mean) / std
      }
    }
  }
  return out
}
