// Unit tests for the verification flow (#9). Run with `npm test` (node:test, Node 22+).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { MODEL_VERSION } from '../src/modelFiles.ts'

import {
  DANGEROUS,
  UNKNOWN,
  answer,
  averageProbabilities,
  checkById,
  dangerousResemblances,
  isDone,
  listedLookalikes,
  nextCheck,
  outcome,
  outcomeText,
  recipeCheck,
  replay,
  showRecipes,
  skip,
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
import { EDIBLE } from './edible.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const records: SpeciesRecord[] = read('../../species/species.json')
const labels: Label[] = read(`../public/models/${MODEL_VERSION}/labels.json`)
const calibration: Calibration = read(`../public/models/${MODEL_VERSION}/calibration.json`)
const species = speciesMap(records)
const ids = labels.map((l) => l.id)

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
      for (const c of state.candidates) {
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

describe('several photos', () => {
  // 29 photos of a chanterelle and one that clearly shows a death cap.
  const perImage = [...Array.from({ length: 29 }, () => probs('cantharellus-cibarius', 0.999)), probs('amanita-phalloides', 0.8)]
  const shown = (s: ReturnType<typeof start>) =>
    s.kind === 'flow' ? new Set([...s.state.candidates.map((c) => c.id), ...s.state.warnings]) : new Set<string>()

  it('shows a dangerous class that is top-1 in one photo even when the average hides it', () => {
    const mean = averageProbabilities(perImage)
    assert.ok(!shown(start(mean, labels, species, calibration)).has('amanita-phalloides'), 'the average alone hides it')
    assert.ok(shown(start(mean, labels, species, calibration, perImage)).has('amanita-phalloides'))
  })

  it('does not add a harmless class or one below the threshold from a single photo', () => {
    const low = [...perImage.slice(0, 29), probs('amanita-phalloides', calibration.unknownThreshold - 0.01)]
    assert.ok(!shown(start(averageProbabilities(low), labels, species, calibration, low)).has('amanita-phalloides'))
  })

  it('shows it also when the average alone says not sure', () => {
    const two = [probs('cantharellus-cibarius', 0.95), probs('amanita-phalloides', 0.9)]
    const mean = averageProbabilities(two)
    assert.deepEqual(start(mean, labels, species, calibration), { kind: 'not-sure' })
    assert.ok(shown(start(mean, labels, species, calibration, two)).has('amanita-phalloides'))
  })

  it('does not add a harmless class from a single photo', () => {
    assert.ok(!DANGEROUS.has(species.get('boletus-edulis-agg')!.ryhma))
    const mixed = [...perImage.slice(0, 29), probs('boletus-edulis-agg', 0.9)]
    assert.ok(!shown(start(averageProbabilities(mixed), labels, species, calibration, mixed)).has('boletus-edulis-agg'))
  })

  it('does not keep an answer about classes that are no longer in', () => {
    const fresh = flow('boletus-edulis-agg', 0.97)
    const unrelated = { check: 'maitiaisneste', answer: 'valkoista' }
    const c = checkById(species).get('maitiaisneste')!
    assert.ok(![...fresh.candidates.map((x) => x.id), ...fresh.warnings].some((id) => Object.values(c.vastaukset).flat().includes(id)))
    assert.deepEqual(replay(fresh, [unrelated], species).asked, [])
  })

  it('keeps the answers given before a photo was added', () => {
    const before = flow('cantharellus-cibarius')
    const c = nextCheck(before, species)!
    const fitting = Object.keys(c.vastaukset).find((a) => c.vastaukset[a]!.includes('cantharellus-cibarius'))!
    const answered = answer(before, c, fitting)!
    const again = replay(flow('cantharellus-cibarius', 0.85), answered.asked, species)
    assert.deepEqual(again.asked, answered.asked)
    assert.deepEqual(again.warnings, answer(flow('cantharellus-cibarius', 0.85), c, fitting)!.warnings)
  })

  it('starts over when the earlier answers rule out every new candidate', () => {
    const fresh = flow('cantharellus-cibarius', 0.97)
    const pores = { check: 'alapinta', answer: 'pillistö (sienimäinen, pienet reiät)' }
    assert.deepEqual(replay(fresh, [pores], species), fresh)
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

  it('keep asking while a dangerous lookalike can still be ruled out', () => {
    const state = flow('morchella', 0.99)
    assert.ok(state.candidates.some((c) => c.id === 'gyromitra-esculenta'))
    assert.equal(isDone(state, species), false)
  })

  it('say the model suggests, not that answers fit, when nothing was answered', () => {
    const text = outcomeText({ kind: 'fits', id: 'morchella', checked: [], openWarnings: [] }, species)
    assert.ok(text[0]!.startsWith('Malli ehdottaa'))
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

describe('dangerous resemblances on "not sure"', () => {
  const resembles = (perImage: number[][], asked: State['asked'] = []) =>
    dangerousResemblances(labels, perImage, species, asked)

  it('names a deadly class that lost to an edible one below the threshold', () => {
    const p = probs('suillus-bovinus', 0.62, { 'paxillus-involutus': 0.28 })
    assert.equal(start(p, labels, species, calibration).kind, 'not-sure')
    assert.ok(resembles([p]).includes('paxillus-involutus'))
  })

  it('lists only dangerous species, never muu, the most likely first', () => {
    const p = probs(UNKNOWN, 0.5, { inocybe: 0.12, 'amanita-virosa': 0.2, 'russula-emetica': 0.05 })
    const r = resembles([p])
    assert.equal(r[0], 'amanita-virosa')
    assert.ok(r.includes('inocybe'))
    assert.ok(!r.includes('russula-emetica') || species.get('amanita-virosa')!.kaksoisolennot.includes('russula-emetica'))
    for (const id of r) assert.ok(DANGEROUS.has(species.get(id)!.ryhma), id)
  })

  it('brings the dangerous lookalikes of a class at the minimum, warning-only ones too', () => {
    const p = probs(UNKNOWN, 0.6, { 'cantharellus-cibarius': 0.3 })
    const r = resembles([p])
    const expected = species.get('cantharellus-cibarius')!.kaksoisolennot.filter((x) => DANGEROUS.has(species.get(x)!.ryhma))
    assert.ok(expected.length > 0)
    for (const x of expected) assert.ok(r.includes(x), x)
    assert.ok(expected.some((x) => !ids.includes(x)), 'a warning-only lookalike')
  })

  it('counts a class by its highest probability in any photo', () => {
    const one = probs('suillus-bovinus', 0.7, { 'paxillus-involutus': 0.25 })
    const other = probs('suillus-bovinus', 0.99)
    assert.ok(resembles([one, other, other]).includes('paxillus-involutus'))
  })

  it('leaves out only what an answer has ruled out', () => {
    const p = probs(UNKNOWN, 0.5, { 'cantharellus-cibarius': 0.2, 'amanita-virosa': 0.2 })
    const check = species.get('cantharellus-cibarius')!.tarkistukset[0]!
    const chosen = Object.keys(check.vastaukset).find((a) => ruledOut(check, a).size > 0)!
    const out = ruledOut(check, chosen)
    const r = resembles([p], [{ check: check.id, answer: chosen }])
    for (const x of out) assert.ok(!r.includes(x), x)
    if (!out.has('amanita-virosa')) assert.ok(r.includes('amanita-virosa'))
    // A skipped check rules nothing out.
    assert.deepEqual(resembles([p], [{ check: check.id, answer: '' }]), resembles([p]))
  })
})

describe('listed lookalikes', () => {
  const checks = checkById(species)

  it('names the false chanterelle beside a chanterelle, until an answer rules it out', () => {
    const r = start(probs('cantharellus-cibarius', 0.99), labels, species, calibration)
    assert.equal(r.kind, 'flow')
    const state = (r as { state: State }).state
    assert.deepEqual(listedLookalikes(state, 'cantharellus-cibarius', species, checks), ['hygrophoropsis-aurantiaca'])
    const ridges = checks.get('harjut-vai-heltat')!
    const after = answer(state, ridges, 'paksuja ja matalia harjuja')!
    assert.ok(after.candidates.some((c) => c.id === 'cantharellus-cibarius'))
    assert.deepEqual(listedLookalikes(after, 'cantharellus-cibarius', species, checks), [])
    // Skipping the check rules nothing out.
    assert.deepEqual(listedLookalikes(skip(state, ridges), 'cantharellus-cibarius', species, checks), ['hygrophoropsis-aurantiaca'])
  })

  it('adds only species nobody should eat: never a food mushroom or a dangerous one', () => {
    for (const rec of records) {
      const state: State = { candidates: [{ id: rec.id, probability: 1, source: 'model' }], warnings: [], asked: [] }
      for (const id of listedLookalikes(state, rec.id, species, checks)) {
        assert.equal(species.get(id)!.ryhma, 'ei ruokasieni', `${rec.id} → ${id}`)
      }
    }
    // The false chanterelle does not name the chanterelle, which would come without its deadly lookalikes.
    const state: State = { candidates: [{ id: 'hygrophoropsis-aurantiaca', probability: 1, source: 'model' }], warnings: [], asked: [] }
    assert.deepEqual(listedLookalikes(state, 'hygrophoropsis-aurantiaca', species, checks), [])
  })
})

describe('recipes (#50)', () => {
  /** Answers every check as the top class would, as render() asks them: the flow's checks,
   * then the recipe check once done. */
  function finish(state: State): State {
    const top = state.candidates[0]!.id
    for (let i = 0; i < 20; i++) {
      const check = isDone(state, species) ? recipeCheck(state, species) : nextCheck(state, species)
      if (!check) break
      const fits = Object.keys(check.vastaukset).find((a) => check.vastaukset[a]!.includes(top))!
      state = answer(state, check, fits) ?? state
    }
    return state
  }

  it('shows them for a syötävä class once the checks are done and nothing else is left', () => {
    const state = flow('cantharellus-cibarius', 0.97)
    assert.equal(showRecipes(state, species), false, 'not before any answer')
    const done = finish(state)
    assert.ok(isDone(done, species))
    assert.deepEqual(done.warnings, [])
    assert.deepEqual(listedLookalikes(done, 'cantharellus-cibarius', species, checkById(species)), [], 'the false chanterelle was ruled out')
    assert.equal(showRecipes(done, species), true)
    assert.equal(showRecipes(done, species, ['amanita-virosa']), false, 'not while a photo resembles a dangerous species')
  })

  it('asks one more check before recipes while a listed lookalike is not ruled out', () => {
    let state = flow('cantharellus-cibarius', 0.97)
    for (let i = 0; i < 20 && !isDone(state, species); i++) {
      const check = nextCheck(state, species)!
      const fits = Object.keys(check.vastaukset).find((a) => check.vastaukset[a]!.includes('cantharellus-cibarius'))!
      state = answer(state, check, fits) ?? state
    }
    if (listedLookalikes(state, 'cantharellus-cibarius', species, checkById(species)).length === 0) return
    assert.equal(showRecipes(state, species), false, 'the false chanterelle is still listed')
    const check = recipeCheck(state, species)
    assert.ok(check, 'a check of the chanterelle that can rule out the false chanterelle')
    assert.ok(Object.keys(check.vastaukset).some((a) => ruledOut(check, a).has('hygrophoropsis-aurantiaca')))
    // Gills: not a chanterelle at all.
    const gills = Object.keys(check.vastaukset).find((a) => !check.vastaukset[a]!.includes('cantharellus-cibarius'))!
    assert.equal(answer(state, check, gills), null)
  })

  it('never for an esikäsiteltävä, poisonous or deadly class, even when done', () => {
    for (const id of ['lactarius-rufus', 'lactarius-trivialis-agg', 'amanita-virosa', 'amanita-muscaria', 'gyromitra-esculenta']) {
      const done = finish(flow(id, 0.97))
      assert.equal(showRecipes(done, species), false, id)
    }
  })

  it('never for "not sure", without an answer, with an open warning or an inedible candidate left', () => {
    assert.equal(showRecipes(null, species), false)
    const state = flow('cantharellus-cibarius', 0.9)
    const check = nextCheck(state, species)!
    assert.equal(showRecipes(skip(state, check), species), false, 'skipping is not an answer')
    const asked = [{ check: 'alapinta', answer: 'x' }]
    const one = (id: string) => ({ id, probability: 1, source: 'model' as const })
    assert.equal(showRecipes({ candidates: [one('cantharellus-cibarius')], warnings: ['cortinarius-orellanus'], asked }, species), false)
    assert.equal(
      showRecipes({ candidates: [one('boletus-edulis-agg'), one('tylopilus-felleus')], warnings: [], asked }, species),
      false,
    )
  })

  it('exist only for syötävä model classes', () => {
    const recipes: Record<string, unknown[]> = read('../../species/reseptit.json')
    for (const id of Object.keys(recipes)) {
      assert.equal(species.get(id)?.ryhma, 'syötävä', id)
      assert.ok(ids.includes(id), id)
    }
  })
})
