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
      assert.ok(data.byteLength < 1.5 * 1024 * 1024, `${m.file} is ${data.byteLength} bytes`)
      const mesh = parseGlb(data)
      const n = mesh.positions.length / 3
      assert.ok(n > 1000)
      assert.equal(mesh.normals.length, n * 3)
      assert.equal(mesh.uvs.length, n * 2)
      assert.equal(mesh.indices.length % 3, 0)
      for (let i = 0; i < 3; i++) assert.ok(mesh.max[i]! > mesh.min[i]!)
      assert.equal(mesh.image.type, 'image/jpeg')
      const head = new Uint8Array(await mesh.image.slice(0, 2).arrayBuffer())
      assert.deepEqual([...head], [0xff, 0xd8])
    })
  }

  it('rejects a file that is not a GLB', () => {
    assert.throws(() => parseGlb(new TextEncoder().encode('v 0 0 0\nv 1 0 0\n').buffer as ArrayBuffer))
  })

  it('rejects a truncated GLB', () => {
    const [first] = Object.values(models)
    assert.throws(() => parseGlb(read(first!.file).slice(0, 2000)))
  })
})
