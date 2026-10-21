// Unit tests for the finds backup file (backup.ts). Run with `npm test`.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { backupName, makeBackup, newFinds, readBackup } from '../src/backup.ts'
import type { Find } from '../src/finds.ts'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 250, 251, 0xff, 0xd9])
const find = (id: number, at: string, speciesId: string | null): Find => ({
  id,
  at,
  speciesId,
  thumb: new Blob([jpeg], { type: 'image/jpeg' }),
  position: id === 1 ? { lat: 60.17, lon: 24.94 } : null,
  fromPhoto: id === 1,
})

describe('finds backup', () => {
  it('reads back what it saved, oldest first', async () => {
    const finds = [find(2, '2026-09-02T10:00:00.000Z', null), find(1, '2026-09-01T10:00:00.000Z', 'cantharellus-cibarius')]
    const text = JSON.stringify(await makeBackup(finds, new Date('2026-10-21T12:00:00Z')))
    const back = readBackup(text)
    assert.deepEqual(
      back.map((f) => [f.at, f.speciesId, f.position, f.fromPhoto]),
      [
        ['2026-09-01T10:00:00.000Z', 'cantharellus-cibarius', { lat: 60.17, lon: 24.94 }, true],
        ['2026-09-02T10:00:00.000Z', null, null, false],
      ],
    )
    assert.deepEqual(new Uint8Array(await back[0]!.thumb.arrayBuffer()), jpeg)
    assert.equal(back[0]!.thumb.type, 'image/jpeg')
  })

  it('rejects files that are not a backup', () => {
    assert.throws(() => readBackup('not json'))
    assert.throws(() => readBackup('{"format":"other","version":1,"finds":[]}'))
    assert.throws(() => readBackup('{"format":"seeni-finds","version":2,"finds":[]}'))
    assert.throws(() => readBackup('[]'))
  })

  it('leaves out broken finds', () => {
    const ok = { at: '2026-09-01T10:00:00Z', speciesId: 'morchella', position: null, fromPhoto: false, thumb: 'data:image/jpeg;base64,/9j/' }
    const text = JSON.stringify({
      format: 'seeni-finds',
      version: 1,
      finds: [
        ok,
        { ...ok, at: 'yesterday' },
        { ...ok, speciesId: 'Bad Id' },
        { ...ok, position: { lat: 200, lon: 0 } },
        { ...ok, thumb: 'data:text/html;base64,PGI+' },
        { ...ok, thumb: 'https://example.com/a.jpg' },
        null,
      ],
    })
    assert.equal(readBackup(text).length, 1)
  })

  it('skips finds that are already on the device', () => {
    const existing = [{ at: 'a', speciesId: 'x' }]
    const thumb = new Blob([])
    const incoming = [
      { at: 'a', speciesId: 'x', thumb, position: null, fromPhoto: false },
      { at: 'a', speciesId: null, thumb, position: null, fromPhoto: false },
      { at: 'a', speciesId: null, thumb, position: null, fromPhoto: false },
    ]
    assert.equal(newFinds(incoming, existing).length, 1)
  })

  it('names the file by the local date', () => {
    assert.equal(backupName(new Date(2026, 0, 5, 23, 30)), 'seeni-loydot-2026-01-05.json')
  })
})
