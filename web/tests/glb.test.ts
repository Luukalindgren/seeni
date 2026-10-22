// The species 3D models (#45): every model in models.json is a GLB the app's reader can
// show, drawn for Seeni or made from a credited photo, and a broken file is rejected so the
// photo stays.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { parseGlb } from '../src/glb.ts'
import speciesRecords from '../../species/species.json' with { type: 'json' }

const dir = new URL('../public/species/3d/', import.meta.url)
const models: Record<
  string,
  { file: string; drawn?: boolean; author?: string; license?: string; source?: string }
> = JSON.parse(
  readFileSync(new URL('models.json', dir), 'utf-8'),
)

function read(file: string): ArrayBuffer {
  const b = readFileSync(new URL(file, dir))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('species 3D models', () => {
  it('are listed for known species, drawn or with a CC0 or CC-BY photo credit', () => {
    const ids = new Set((speciesRecords as { id: string }[]).map((r) => r.id))
    assert.ok(Object.keys(models).length > 0)
    for (const [id, m] of Object.entries(models)) {
      assert.ok(ids.has(id), `${id} is not in species.json`)
      if (m.drawn) continue
      assert.match(m.license ?? '', /^CC0-1\.0$|^CC-BY-4\.0$/)
      assert.ok(m.author)
      assert.match(m.source ?? '', /^https:\/\/www\.gbif\.org\/occurrence\/\d+$/)
    }
  })

  for (const [id, m] of Object.entries(models)) {
    it(`${id}: the GLB reads, is small and has a JPEG texture`, async () => {
      const data = read(m.file)
      assert.ok(data.byteLength < 750 * 1024, `${m.file} is ${data.byteLength} bytes`)
      const mesh = parseGlb(data)
      const n = mesh.positions.length / 3
      assert.ok(n > 1000)
      assert.equal(mesh.normals.length, n * 3)
      assert.equal(mesh.uvs.length, n * 2)
      // Drawn models are one strip; a list of triangles comes in threes.
      assert.ok(mesh.strip ? mesh.indices.length >= 3 : mesh.indices.length % 3 === 0)
      for (let i = 0; i < n; i++) {
        const l = Math.hypot(mesh.normals[3 * i]!, mesh.normals[3 * i + 1]!, mesh.normals[3 * i + 2]!)
        assert.ok(Math.abs(l - 1) < 0.02, `normal ${i} has length ${l}`)
      }
      for (const v of mesh.uvs) assert.ok(v >= 0 && v <= 1)
      // It stands on y = 0, upright.
      assert.ok(Math.abs(mesh.min[1]) < 0.02 && mesh.max[1] > 0.6)
      for (let i = 0; i < 3; i++) assert.ok(mesh.max[i]! > mesh.min[i]!)
      assert.equal(mesh.image.type, 'image/jpeg')
      const head = new Uint8Array(await mesh.image.slice(0, 2).arrayBuffer())
      assert.deepEqual([...head], [0xff, 0xd8])
    })
  }

  it('rejects a file that is not a GLB', () => {
    assert.throws(() => parseGlb(new TextEncoder().encode('v 0 0 0\nv 1 0 0\n').buffer as ArrayBuffer))
  })

  it('rejects an extension it does not know', () => {
    const [first] = Object.values(models)
    const data = new Uint8Array(read(first!.file))
    const length = new DataView(data.buffer).getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + length)))
    json.extensionsRequired = ['KHR_draco_mesh_compression']
    // Rebuild the GLB around the changed JSON chunk, padded to 4 bytes.
    const text = new TextEncoder().encode(JSON.stringify(json))
    const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20)
    padded.set(text)
    const bin = data.subarray(20 + length)
    const out = new Uint8Array(20 + padded.length + bin.length)
    out.set(data.subarray(0, 20))
    out.set(padded, 20)
    out.set(bin, 20 + padded.length)
    new DataView(out.buffer).setUint32(8, out.length, true)
    new DataView(out.buffer).setUint32(12, padded.length, true)
    assert.throws(() => parseGlb(out.buffer), /unsupported extension/)
  })

  it('rejects a truncated GLB', () => {
    const [first] = Object.values(models)
    assert.throws(() => parseGlb(read(first!.file).slice(0, 2000)))
  })
})
