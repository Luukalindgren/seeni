// Species content in English (#52): complete, and never changing the logic.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import { answer, speciesMap, start, type Calibration, type Label, type SpeciesRecord } from '../src/flow.ts'
import { answerText, localizeRecords, translationProblems, type Translation } from '../src/speciesText.ts'
import { EDIBLE } from './edible.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const records: SpeciesRecord[] = read('../../species/species.json')
const en: Translation = read('../../species/species.en.json')
const labels: Label[] = read('../public/models/v1/labels.json')
const calibration: Calibration = read('../public/models/v1/calibration.json')

describe('species.en.json', () => {
  it('covers exactly the records, features, checks and answers of species.json', () => {
    assert.deepEqual(translationProblems(records, en), [])
  })

  it('reports what is missing or extra', () => {
    const broken: Translation = structuredClone(en)
    delete broken.records['amanita-phalloides']
    delete broken.checks['tyvi']!.vastaukset['kyllä']
    broken.checks['tyvi']!.vastaukset['ehkä'] = 'maybe'
    const problems = translationProblems(records, broken).join('\n')
    assert.match(problems, /record amanita-phalloides: no English name/)
    assert.match(problems, /check tyvi: no English text for "kyllä"/)
    assert.match(problems, /check tyvi: "ehkä" is not an answer/)
  })

  it('never states edibility', () => {
    for (const r of Object.values(en.records)) for (const text of [r.nimi, ...r.tuntomerkit]) assert.doesNotMatch(text, EDIBLE)
    for (const c of Object.values(en.checks)) for (const text of [c.kysymys, ...Object.values(c.vastaukset)]) assert.doesNotMatch(text, EDIBLE)
  })
})

describe('localizeRecords', () => {
  const english = localizeRecords(records, 'en', en)

  it('changes only the texts', () => {
    records.forEach((r, i) => {
      const e = english[i]!
      assert.equal(e.id, r.id)
      assert.equal(e.ryhma, r.ryhma)
      assert.deepEqual(e.kaksoisolennot, r.kaksoisolennot)
      assert.deepEqual(e.taxonKeys, r.taxonKeys)
      e.tarkistukset.forEach((c, j) => assert.deepEqual(c.vastaukset, r.tarkistukset[j]!.vastaukset))
    })
    assert.equal(english.find((r) => r.id === 'cantharellus-cibarius')!.nimi, 'chanterelle')
  })

  it('keeps Finnish as it is', () => {
    assert.equal(localizeRecords(records, 'fi', en), records)
    assert.equal(answerText({ id: 'tyvi' }, 'kyllä', 'fi', en), 'kyllä')
    assert.equal(answerText({ id: 'tyvi' }, 'kyllä', 'en', en), 'yes')
  })

  it('gives the same flow in both languages', () => {
    const fiSpecies = speciesMap(records)
    const enSpecies = speciesMap(english)
    for (let k = 0; k < labels.length; k++) {
      const p = labels.map((_, i) => (i === k ? 0.9 : 0.1 / (labels.length - 1)))
      const a = start(p, labels, fiSpecies, calibration)
      const b = start(p, labels, enSpecies, calibration)
      assert.equal(a.kind, b.kind)
      if (a.kind !== 'flow' || b.kind !== 'flow') continue
      assert.deepEqual(b.state.candidates, a.state.candidates)
      assert.deepEqual(b.state.warnings, a.state.warnings)
      // The same answer key gives the same next state.
      const check = fiSpecies.get(a.state.candidates[0]!.id)?.tarkistukset[0]
      if (!check) continue
      const enCheck = enSpecies.get(a.state.candidates[0]!.id)!.tarkistukset[0]!
      const key = Object.keys(check.vastaukset)[0]!
      assert.deepEqual(answer(b.state, enCheck, key)?.candidates, answer(a.state, check, key)?.candidates)
    }
  })
})
