// Unit tests for the verification flow (#9). Run with `npm test` (node:test, Node 22+).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

import {
  DANGEROUS,
  UNKNOWN,
  answer,
  averageProbabilities,
  isDone,
  nextCheck,
  outcome,
  outcomeText,
  ruledOut,
  softmax,
  speciesMap,
  start,
  type Calibration,
  type Check,
  type Label,
  type SpeciesRecord,
  type State,
} from '../src/flow.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const records: SpeciesRecord[] = read('../../species/species.json')
const labels: Label[] = read('../public/models/v1/labels.json')
const calibration: Calibration = read('../public/models/v1/calibration.json')
const species = speciesMap(records)
const ids = labels.map((l) => l.id)
const EDIBLE = /syötäv|voi syödä|saa syödä|ruokasien|herkullinen/i

/** Probabilities with `top` at p and the rest spread evenly. */
function probs(top: string, p: number, extra: Record<string, number> = {}): number[] {
  const rest = (1 - p - Object.values(extra).reduce((a, b) => a + b, 0)) / (ids.length - 1 - Object.keys(extra).length)
  return ids.map((id) => (id === top ? p : (extra[id] ?? rest)))
}

function flow(top: string, p = 0.9, extra: Record<string, number> = {}): State {
  const s = start(probs(top, p, extra), labels, species, calibration)
  assert.equal(s.kind, 'flow')
  return (s as { kind: 'flow'; state: State }).state
}

describe('start', () => {
  it('says not sure when muu is on top', () => {
    assert.deepEqual(start(probs(UNKNOWN, 0.9), labels, species, calibration), { kind: 'not-sure' })
  })

  it('says not sure below the unknown threshold', () => {
    const p = calibration.unknownThreshold - 0.01
    assert.deepEqual(start(probs('cantharellus-cibarius', p), labels, species, calibration), { kind: 'not-sure' })
  })

  it('never makes muu a candidate', () => {
    const state = flow('cantharellus-cibarius', 0.8, { [UNKNOWN]: 0.19 })
    assert.ok(state.candidates.every((c) => c.id !== UNKNOWN))
  })

  it('always shows the dangerous lookalikes of every candidate', () => {
    for (const id of ids.filter((i) => i !== UNKNOWN)) {
      const state = flow(id, 0.97)
      const shown = new Set([...state.candidates.map((c) => c.id), ...state.warnings])
      for (const c of state.candidates.filter((k) => k.source === 'model')) {
        for (const x of species.get(c.id)!.kaksoisolennot) {
          if (DANGEROUS.has(species.get(x)!.ryhma)) assert.ok(shown.has(x), `${c.id} must show ${x}`)
        }
      }
    }
  })

  it('shows warning-only lookalikes as open warnings', () => {
    assert.ok(!ids.includes('verpa-bohemica'))
    assert.ok(flow('morchella').warnings.includes('verpa-bohemica'))
  })

  it('shows esikäsiteltävä lookalikes of a syötävä candidate', () => {
    assert.equal(species.get('armillaria')!.ryhma, 'esikäsiteltävä')
    const state = flow('kuehneromyces-mutabilis')
    assert.ok(state.candidates.some((c) => c.id === 'armillaria'))
  })

  it('takes candidates up to 95 % and at most 5', () => {
    const state = flow('suillus-luteus', 0.8, { 'suillus-bovinus': 0.1, 'suillus-variegatus': 0.06 })
    const model = state.candidates.filter((c) => c.source === 'model').map((c) => c.id)
    assert.deepEqual(model, ['suillus-luteus', 'suillus-bovinus', 'suillus-variegatus'])
  })
})

const check: Check = { id: 'x', kysymys: '?', vastaukset: { a: ['p'], b: ['q'] } }

describe('checks', () => {
  it('rule out only the classes they mention', () => {
    assert.deepEqual([...ruledOut(check, 'a')], ['q'])
    const state: State = {
      candidates: [
        { id: 'p', probability: 0.5, source: 'model' },
        { id: 'q', probability: 0.3, source: 'model' },
        { id: 'r', probability: 0.2, source: 'model' },
      ],
      warnings: ['w'],
      asked: [],
    }
    const after = answer(state, check, 'a')!
    assert.deepEqual(after.candidates.map((c) => c.id), ['p', 'r'])
    assert.deepEqual(after.warnings, ['w'])
    assert.ok(Math.abs(after.candidates.reduce((s, c) => s + c.probability, 0) - 1) < 1e-9)
  })

  it('give not sure when every model class is ruled out', () => {
    const state: State = { candidates: [{ id: 'q', probability: 1, source: 'model' }], warnings: [], asked: [] }
    assert.equal(answer(state, check, 'a'), null)
    assert.equal(outcome(null, species).kind, 'not-sure')
  })

  it('prefer a check that separates a dangerous candidate', () => {
    const state = flow('agaricus-campestris-agg', 0.9)
    const c = nextCheck(state, species)
    assert.ok(c)
    const out = new Set(Object.keys(c.vastaukset).flatMap((a) => [...ruledOut(c, a)]))
    assert.ok([...out].some((id) => DANGEROUS.has(species.get(id)!.ryhma)), c.id)
  })

  it('never rule out a deadly lookalike of agaricus by the base of the stem alone', () => {
    const tyvi = species.get('amanita-virosa')!.tarkistukset.find((c) => c.id === 'tyvi')!
    for (const a of Object.keys(tyvi.vastaukset)) assert.ok(!ruledOut(tyvi, a).has('amanita-virosa'))
  })
})

describe('outcome', () => {
  it('lists open dangerous warnings and never states edibility', () => {
    for (const id of ids.filter((i) => i !== UNKNOWN)) {
      let state: State | null = flow(id, 0.9)
      // Answer every check with its first answer that fits the top class, or the first one.
      while (state && !isDone(state, species)) {
        const c = nextCheck(state, species)!
        const fit = Object.keys(c.vastaukset).find((a) => c.vastaukset[a]!.includes(id)) ?? Object.keys(c.vastaukset)[0]!
        state = answer(state, c, fit)
      }
      const result = outcome(state, species)
      for (const line of outcomeText(result, species)) assert.ok(!EDIBLE.test(line), `${id}: ${line}`)
      if (result.kind === 'fits' && state) {
        const dangerousLeft = [...state.candidates.map((c) => c.id), ...state.warnings].filter(
          (x) => x !== result.id && DANGEROUS.has(species.get(x)!.ryhma),
        )
        assert.deepEqual(new Set(result.openWarnings), new Set(dangerousLeft))
      }
    }
    for (const line of outcomeText({ kind: 'not-sure' }, species)) assert.ok(!EDIBLE.test(line))
  })

  it('keeps the warning-only lookalike open unless a check rules it out', () => {
    const state = flow('morchella', 0.99)
    assert.deepEqual(outcome(state, species), {
      kind: 'fits',
      id: 'morchella',
      checked: [],
      openWarnings: state.candidates.filter((c) => c.id !== 'morchella').map((c) => c.id).concat(['verpa-bohemica']),
    })
  })
})

describe('probabilities', () => {
  it('softmax with temperature', () => {
    const p = softmax([1, 0], 0.5)
    assert.ok(Math.abs(p[0]! - Math.exp(2) / (Math.exp(2) + 1)) < 1e-12)
  })

  it('average over images', () => {
    assert.deepEqual(averageProbabilities([[1, 0], [0, 1]]), [0.5, 0.5])
  })
})
