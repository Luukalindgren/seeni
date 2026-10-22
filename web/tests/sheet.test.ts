// The identification sheet of a lookalike (#47).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { afterEach, describe, it } from 'node:test'

import { speciesMap, type Label, type SpeciesRecord } from '../src/flow.ts'
import { LANGS, setLang } from '../src/i18n.ts'
import { differences, sheet, sheetTexts } from '../src/sheet.ts'
import { answerText, localizeRecords, type Translation } from '../src/speciesText.ts'
import { EDIBLE } from './edible.ts'
import { MODEL_VERSION } from '../src/modelFiles.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const records: SpeciesRecord[] = read('../../species/species.json')
const en: Translation = read('../../species/species.en.json')
const labels: Label[] = read(`../public/models/${MODEL_VERSION}/labels.json`)
const species = speciesMap(records)
const model = new Set(labels.map((l) => l.id))

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

  afterEach(() => setLang('fi'))

  it('never states edibility, in either language, for any species compared with any lookalike', () => {
    for (const l of LANGS) {
      setLang(l)
      const local = speciesMap(localizeRecords(records, l, en))
      const answer = (c: { id: string }, k: string) => answerText(c, k, l, en)
      for (const a of local.keys()) {
        for (const b of [null, ...local.get(a)!.kaksoisolennot]) {
          for (const text of sheetTexts(sheet(a, b, local, model), answer)) {
            assert.doesNotMatch(text, EDIBLE, `${l} ${a}/${b}: ${text}`)
          }
        }
      }
    }
  })

  it('labels danger the same way in English', () => {
    setLang('en')
    const local = speciesMap(localizeRecords(records, 'en', en))
    assert.equal(sheet('amanita-phalloides', null, local, model).label, 'Deadly poisonous')
    assert.equal(sheet('cantharellus-cibarius', null, local, model).label, null)
    assert.equal(sheet('lactarius-rufus', null, local, model).label, 'Poisonous raw')
  })
})
