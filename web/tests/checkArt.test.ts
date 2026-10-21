// Every check in species.json has a picture, and no caption states edibility (#9).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { CHECK_PICTURE_CAPTIONS, CHECK_PICTURE_IDS, checkPicture } from '../src/checkArt.ts'
import type { SpeciesRecord } from '../src/flow.ts'

const records: SpeciesRecord[] = JSON.parse(
  readFileSync(new URL('../../species/species.json', import.meta.url), 'utf8'),
)
const checkIds = new Set(records.flatMap((r) => r.tarkistukset.map((c) => c.id)))
// The same pattern as training/src/seeni/species.py and flow.test.ts.
const EDIBLE = /syötäv|syödä|syöd|ruokasien|herkullinen|maukas/i

describe('check pictures', () => {
  it('every check has a picture', () => {
    for (const id of checkIds) assert.ok(checkPicture(id), `no picture for ${id}`)
  })

  it('every picture belongs to a check', () => {
    for (const id of CHECK_PICTURE_IDS) assert.ok(checkIds.has(id), `${id} is not a check`)
  })

  it('no caption states edibility', () => {
    for (const c of CHECK_PICTURE_CAPTIONS) assert.doesNotMatch(c, EDIBLE)
  })

  it('pictures are well-formed svg', () => {
    for (const id of checkIds) {
      const art = checkPicture(id) ?? ''
      assert.match(art, /^<svg [^>]*viewBox="0 0 \d+ \d+"[^>]*>.*<\/svg>$/s)
      assert.doesNotMatch(art, /NaN|undefined/)
    }
  })
})
