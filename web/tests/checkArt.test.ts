// Every check in species.json has a picture, and no caption states edibility (#9).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { CHECK_PICTURE_CAPTIONS, CHECK_PICTURE_IDS, checkPicture } from '../src/checkArt.ts'
import type { SpeciesRecord } from '../src/flow.ts'

const records: SpeciesRecord[] = JSON.parse(
  readFileSync(new URL('../../species/species.json', import.meta.url), 'utf8'),
)
const checks = new Map(records.flatMap((r) => r.tarkistukset.map((c) => [c.id, c] as const)))
// The same pattern as training/src/seeni/species.py and flow.test.ts.
const EDIBLE = /syötäv|syödä|syöd|ruokasien|herkullinen|maukas/i

describe('check pictures', () => {
  it('every check has a picture of exactly its answers', () => {
    for (const c of checks.values()) assert.ok(checkPicture(c), `no picture, or other answers, for ${c.id}`)
  })

  it('a picture whose answers differ from the check is not shown', () => {
    const c = checks.get('itiopoly')!
    const [first, ...rest] = Object.keys(c.vastaukset)
    const renamed = Object.fromEntries([[`${first} tai vaalea`, c.vastaukset[first!]!], ...rest.map((a) => [a, c.vastaukset[a]!])])
    assert.equal(checkPicture({ id: c.id, vastaukset: renamed }), undefined)
  })

  it('panels follow the order of the answers', () => {
    const c = checks.get('maitiaisneste')!
    const reversed = Object.fromEntries(Object.entries(c.vastaukset).reverse())
    const captions = (art: string) => [...art.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    assert.deepEqual(captions(checkPicture({ id: c.id, vastaukset: reversed })!), captions(checkPicture(c)!).reverse())
  })

  it('every picture belongs to a check', () => {
    for (const id of CHECK_PICTURE_IDS) assert.ok(checks.has(id), `${id} is not a check`)
  })

  it('no caption states edibility', () => {
    for (const c of CHECK_PICTURE_CAPTIONS) assert.doesNotMatch(c, EDIBLE)
  })

  it('pictures are well-formed svg', () => {
    for (const c of checks.values()) {
      const art = checkPicture(c) ?? ''
      assert.match(art, /^<svg [^>]*viewBox="0 0 \d+ \d+"[^>]*>.*<\/svg>$/s)
      assert.doesNotMatch(art, /NaN|undefined/)
    }
  })
})
