// Preprocessing parity (#14): the TypeScript resize, crop and normalize on the decoded
// pixels of the fixture images must give the tensors that Python wrote. JPEG decoding is
// the one step left out; the browser end-to-end test (#10) covers it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MODEL_VERSION } from '../src/modelFiles.ts'

import { readNpy as parseNpy } from '../src/npy.ts'
import { preprocess, resizedSize, type PreprocessSpec } from '../src/preprocess.ts'

const fixtures = new URL('./fixtures/', import.meta.url)
const golden = JSON.parse(readFileSync(new URL('golden.json', fixtures), 'utf8'))
const spec: PreprocessSpec = JSON.parse(readFileSync(new URL(`../public/models/${MODEL_VERSION}/preprocess.json`, import.meta.url), 'utf8'))

const readNpy = (path: URL) => parseNpy(new Uint8Array(readFileSync(path)))

describe('preprocess', () => {
  it('sizes like torchvision Resize', () => {
    assert.deepEqual(resizedSize(683, 512, 256), [341, 256])
    assert.deepEqual(resizedSize(512, 683, 256), [256, 341])
  })

  for (const path of golden.decoded as string[]) {
    it(`matches Python on ${path}`, () => {
      const decoded = readNpy(new URL(path, fixtures))
      const [height, width] = decoded.shape as [number, number, number]
      const expected = readNpy(new URL(path.replace('decoded/', 'tensors/'), fixtures)).data
      const ours = preprocess({ data: decoded.data as Uint8Array, width, height, channels: 3 }, spec)
      assert.equal(ours.length, expected.length)
      let max = 0
      for (let i = 0; i < ours.length; i++) max = Math.max(max, Math.abs(ours[i]! - expected[i]!))
      assert.ok(max < 1e-5, `max difference ${max}`)
    })
  }

  it('accepts RGBA pixels as canvas ImageData gives them', () => {
    const rgb = new Uint8Array(300 * 260 * 3).map((_, i) => (i * 7) % 256)
    const rgba = new Uint8Array(300 * 260 * 4)
    for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) rgba.set([rgb[i]!, rgb[i + 1]!, rgb[i + 2]!, 255], j)
    const a = preprocess({ data: rgb, width: 300, height: 260, channels: 3 }, spec)
    const b = preprocess({ data: rgba, width: 300, height: 260, channels: 4 }, spec)
    assert.deepEqual(a, b)
  })
})
