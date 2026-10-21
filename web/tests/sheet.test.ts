// The identification sheet of a lookalike (#47).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { speciesMap, type Label, type SpeciesRecord } from '../src/flow.ts'
import { differences, sheet, sheetTexts } from '../src/sheet.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const records: SpeciesRecord[] = read('../../species/species.json')
const labels: Label[] = read('../public/models/v1/labels.json')
const species = speciesMap(records)
const model = new Set(labels.map((l) => l.id))
// The same pattern as EDIBLE in training/src/seeni/species.py.
const EDIBLE = /syötäv|syödä|syöd|ruokasien|herkullinen|maukas/i

describe('differences', () => {
  it('lists the checks that tell a chanterelle from a false chanterelle', () => {
    const d = differences('hygrophoropsis-aurantiaca', 'cantharellus-cibarius', species)
    const ids = d.map((x) => x.check.id)
    assert.ok(ids.includes('harjut-vai-heltat'))
    const ridges = d.find((x) => x.check.id === 'harjut-vai-heltat')!
    assert.deepEqual(ridges.self, ['ohuita ja tiheitä heltoja'])
    assert.deepEqual(ridges.other, ['paksuja ja matalia harjuja'])
  })

  it('leaves out checks that do not mention both, or fit both the same', () => {
    for (const a of species.keys()) {
      for (const b of species.get(a)!.kaksoisolennot) {
        for (const d of differences(a, b, species)) {
          const all = new Set(Object.values(d.check.vastaukset).flat())
          assert.ok(all.has(a) && all.has(b), `${d.check.id} must mention ${a} and ${b}`)
          assert.notDeepEqual(d.self, d.other)
        }
      }
    }
  })
})

describe('sheet', () => {
  it('marks a warning-only record as not recognizable by the model', () => {
    assert.equal(sheet('verpa-bohemica', 'morchella', species, model).warningOnly, true)
    assert.equal(sheet('morchella', null, species, model).warningOnly, false)
  })

  it('gives a syötävä class no label', () => {
    assert.equal(species.get('cantharellus-cibarius')!.ryhma, 'syötävä')
    assert.equal(sheet('cantharellus-cibarius', null, species, model).label, null)
    assert.equal(sheet('amanita-phalloides', null, species, model).label, 'Tappavan myrkyllinen')
  })

  it('never states edibility, for any species compared with any lookalike', () => {
    for (const a of species.keys()) {
      for (const b of [null, ...species.get(a)!.kaksoisolennot]) {
        for (const text of sheetTexts(sheet(a, b, species, model))) assert.doesNotMatch(text, EDIBLE, `${a}/${b}: ${text}`)
      }
    }
  })
})
