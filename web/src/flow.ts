// Verification flow (PLAN.md phase 9, #9): from the model's probabilities to candidates,
// lookalike warnings, checks and a result. Pure functions with no DOM, so they are unit
// tested with node:test (tests/flow.test.ts).
//
// Safety (CLAUDE.md hard rule 8): the dangerous lookalikes of every candidate are always
// shown, `muu` is never a candidate, a check rules out only the classes it mentions, and no
// text states that a mushroom is edible.

export type Group = 'tappava' | 'myrkyllinen' | 'ei ruokasieni' | 'esikäsiteltävä' | 'syötävä'

export const UNKNOWN = 'muu'
export const DANGEROUS: ReadonlySet<Group> = new Set(['tappava', 'myrkyllinen', 'esikäsiteltävä'])
// A dangerous class weighs this much more than a harmless one when choosing a check.
export const DANGER_WEIGHT = 3
// The flow stops when one candidate has this share of the remaining probability.
export const STAND_OUT = 0.95

export interface Label {
  id: string
  taxonKeys: number[]
}

export interface Check {
  id: string
  kysymys: string
  vastaukset: Record<string, string[]>
}

export interface SpeciesRecord {
  id: string
  taxonKeys: number[]
  tieteellinen: string
  nimi: string
  ryhma: Group
  tuntomerkit: string[]
  kaksoisolennot: string[]
  tarkistukset: Check[]
  lahteet: string[]
  tarkistanut: string
}

export interface Calibration {
  temperature: number
  unknownThreshold: number
  candidateMass: number
  maxCandidates: number
}

export interface Candidate {
  id: string
  // Model probability, renormalized over the candidates that are still in.
  probability: number
  // 'model': a top class; 'lookalike': added as a dangerous lookalike of a candidate.
  source: 'model' | 'lookalike'
}

export interface State {
  candidates: Candidate[]
  // Warning-only records (not model classes) that no check has ruled out yet.
  warnings: string[]
  asked: { check: string; answer: string }[]
}

export type Outcome =
  | { kind: 'not-sure' }
  | { kind: 'fits'; id: string; checked: State['asked']; openWarnings: string[] }

export type Species = ReadonlyMap<string, SpeciesRecord>

export function speciesMap(records: SpeciesRecord[]): Species {
  return new Map(records.map((r) => [r.id, r]))
}

export function softmax(logits: readonly number[], temperature = 1): number[] {
  const scaled = logits.map((x) => x / temperature)
  const max = Math.max(...scaled)
  const exp = scaled.map((x) => Math.exp(x - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  return exp.map((x) => x / sum)
}

/** Mean of the per-image probabilities, when the user takes several photos. */
export function averageProbabilities(perImage: readonly (readonly number[])[]): number[] {
  const first = perImage[0]
  if (!first) throw new Error('no images')
  return first.map((_, i) => perImage.reduce((s, p) => s + (p[i] ?? 0), 0) / perImage.length)
}

function isDangerous(id: string, species: Species): boolean {
  const r = species.get(id)
  return r !== undefined && DANGEROUS.has(r.ryhma)
}

function normalize(candidates: Candidate[]): Candidate[] {
  const sum = candidates.reduce((s, c) => s + c.probability, 0)
  return candidates.map((c) => ({ ...c, probability: sum > 0 ? c.probability / sum : 1 / candidates.length }))
}

/** The first step: "not sure", or the candidates with their dangerous lookalikes.
 * `perImage` are the probabilities of each photo when there are several (#46): averaging can
 * hide a dangerous class that one photo shows clearly, so a dangerous class that is top-1 in
 * a single photo above the "not sure" threshold is a candidate too, also when the average
 * alone would say "not sure". */
export function start(
  probabilities: readonly number[],
  labels: readonly Label[],
  species: Species,
  calibration: Calibration,
  perImage: readonly (readonly number[])[] = [],
): { kind: 'not-sure' } | { kind: 'flow'; state: State } {
  if (probabilities.length !== labels.length) throw new Error('probabilities do not match labels.json')
  const order = probabilities
    .map((p, i) => ({ id: labels[i]!.id, p }))
    .sort((a, b) => b.p - a.p)
  const modelProbability = new Map(order.map(({ id, p }) => [id, p]))
  // Dangerous classes that one photo shows clearly; they are candidates even when the
  // average says "not sure".
  const flagged: string[] = []
  for (const p of perImage) {
    if (p.length !== labels.length) throw new Error('per-image probabilities do not match labels.json')
    const best = p.reduce((b, x, i) => (x > p[b]! ? i : b), 0)
    const id = labels[best]!.id
    if (id === UNKNOWN || p[best]! < calibration.unknownThreshold || !isDangerous(id, species)) continue
    if (!flagged.includes(id)) flagged.push(id)
  }

  const candidates: Candidate[] = []
  const top = order[0]
  if (top && top.id !== UNKNOWN && top.p >= calibration.unknownThreshold) {
    let mass = 0
    for (const { id, p } of order) {
      if (id === UNKNOWN) continue
      candidates.push({ id, probability: p, source: 'model' })
      mass += p
      if (mass >= calibration.candidateMass || candidates.length >= calibration.maxCandidates) break
    }
  }
  for (const id of flagged) {
    if (!candidates.some((c) => c.id === id)) candidates.push({ id, probability: modelProbability.get(id)!, source: 'model' })
  }
  if (candidates.length === 0) return { kind: 'not-sure' }

  // Dangerous lookalikes of every candidate, also of the ones added here (hard rule 8).
  const warnings: string[] = []
  const queue = candidates.map((c) => c.id)
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const x of species.get(id)?.kaksoisolennot ?? []) {
      if (!isDangerous(x, species)) continue
      if (candidates.some((k) => k.id === x) || warnings.includes(x)) continue
      const p = modelProbability.get(x)
      if (p === undefined) warnings.push(x)
      else candidates.push({ id: x, probability: p, source: 'lookalike' })
      queue.push(x)
    }
  }
  return { kind: 'flow', state: { candidates: normalize(candidates), warnings, asked: [] } }
}

function checksFor(state: State, species: Species): Check[] {
  const seen = new Map<string, Check>()
  for (const id of [...state.candidates.map((c) => c.id), ...state.warnings]) {
    for (const check of species.get(id)?.tarkistukset ?? []) {
      if (!seen.has(check.id)) seen.set(check.id, check)
    }
  }
  const asked = new Set(state.asked.map((a) => a.check))
  return [...seen.values()].filter((c) => !asked.has(c.id))
}

export function mentioned(check: Check): Set<string> {
  return new Set(Object.values(check.vastaukset).flat())
}

/** The classes an answer rules out: those the check mentions, but not under the answer. */
export function ruledOut(check: Check, answer: string): Set<string> {
  const fits = new Set(check.vastaukset[answer] ?? [])
  return new Set([...mentioned(check)].filter((id) => !fits.has(id)))
}

/** Expected weight of what the check rules out. Dangerous candidates weigh more, and ruling
 * out an open warning counts as much as ruling out the most likely dangerous candidate. */
export function score(check: Check, state: State, species: Species): number {
  const weight = new Map<string, number>()
  for (const c of state.candidates) {
    weight.set(c.id, c.probability * (isDangerous(c.id, species) ? DANGER_WEIGHT : 1))
  }
  const top = Math.max(...state.candidates.map((c) => c.probability))
  for (const w of state.warnings) weight.set(w, top * DANGER_WEIGHT)

  const answers = Object.keys(check.vastaukset)
  const all = mentioned(check)
  // P(answer): each candidate spreads its probability over the answers it fits.
  const pAnswer = new Map(answers.map((a) => [a, 0]))
  for (const c of state.candidates) {
    const fitting = all.has(c.id) ? answers.filter((a) => check.vastaukset[a]!.includes(c.id)) : answers
    for (const a of fitting) pAnswer.set(a, pAnswer.get(a)! + c.probability / fitting.length)
  }
  let total = 0
  for (const a of answers) {
    let out = 0
    for (const id of ruledOut(check, a)) out += weight.get(id) ?? 0
    total += pAnswer.get(a)! * out
  }
  return total
}

/** The check that best splits the candidates, or null when no check can rule anything out. */
export function nextCheck(state: State, species: Species): Check | null {
  let best: Check | null = null
  let bestScore = 0
  for (const check of checksFor(state, species)) {
    const s = score(check, state, species)
    if (s > bestScore) {
      best = check
      bestScore = s
    }
  }
  return best
}

/** Apply an answer. Returns null when it rules out every model class: "not sure". */
export function answer(state: State, check: Check, chosen: string): State | null {
  if (!(chosen in check.vastaukset)) throw new Error(`${check.id} has no answer ${chosen}`)
  const out = ruledOut(check, chosen)
  const candidates = state.candidates.filter((c) => !out.has(c.id))
  if (candidates.length === 0) return null
  return {
    candidates: normalize(candidates),
    warnings: state.warnings.filter((w) => !out.has(w)),
    asked: [...state.asked, { check: check.id, answer: chosen }],
  }
}

/** Every check of the species records by its id. */
export function checkById(species: Species): Map<string, Check> {
  return new Map([...species.values()].flatMap((r) => r.tarkistukset.map((c) => [c.id, c] as const)))
}

/** The answers given before applied to a new start, e.g. after another photo is added (#46).
 * The answers describe the mushroom, so they still hold; if together they rule out every
 * candidate, the flow starts over without them. */
export function replay(state: State, asked: State['asked'], species: Species): State {
  const checks = checkById(species)
  let next: State | null = state
  for (const a of asked) {
    const check = checks.get(a.check)
    if (!check || !next) break
    // Only answers about the classes still in: an answer to a check that mentions none of
    // them says nothing about this result.
    const about = mentioned(check)
    if (![...next.candidates.map((c) => c.id), ...next.warnings].some((id) => about.has(id))) continue
    next = a.answer === '' ? skip(next, check) : a.answer in check.vastaukset ? answer(next, check, a.answer) : next
  }
  return next ?? state
}

/** The user could not check this: it is not asked again and rules nothing out. */
export function skip(state: State, check: Check): State {
  return { ...state, asked: [...state.asked, { check: check.id, answer: '' }] }
}

/** Done when no check is left, or when one candidate stands out and no check left could
 * rule out a dangerous candidate or an open warning other than it. */
export function isDone(state: State, species: Species): boolean {
  const remaining = checksFor(state, species).filter((c) => score(c, state, species) > 0)
  if (remaining.length === 0) return true
  const top = [...state.candidates].sort((a, b) => b.probability - a.probability)[0]!
  if (top.probability < STAND_OUT) return false
  const open = new Set([
    ...state.candidates.filter((c) => c.id !== top.id && isDangerous(c.id, species)).map((c) => c.id),
    ...state.warnings,
  ])
  return !remaining.some((c) => Object.keys(c.vastaukset).some((a) => [...ruledOut(c, a)].some((x) => open.has(x))))
}

/** The result once the flow is done. Open warnings are every dangerous class still in. */
export function outcome(state: State | null, species: Species): Outcome {
  if (state === null || state.candidates.length === 0) return { kind: 'not-sure' }
  const top = [...state.candidates].sort((a, b) => b.probability - a.probability)[0]!
  const openWarnings = [
    ...state.candidates.filter((c) => c.id !== top.id && isDangerous(c.id, species)).map((c) => c.id),
    ...state.warnings,
  ]
  const checked = state.asked.filter((a) => a.answer !== '')
  return { kind: 'fits', id: top.id, checked, openWarnings }
}

const GROUP_TEXT: Partial<Record<Group, string>> = {
  tappava: 'Tappavan myrkyllinen.',
  myrkyllinen: 'Myrkyllinen.',
  esikäsiteltävä: 'Myrkyllinen raakana.',
}

/** Result text for the user. It never states edibility (hard rule 8). */
export function outcomeText(result: Outcome, species: Species): string[] {
  const reminder = 'Tunnistus ei ole varma. Älä syö sientä tämän tuloksen perusteella.'
  if (result.kind === 'not-sure') return ['En tunnista varmasti.', reminder]
  const r = species.get(result.id)
  const name = r ? `${r.nimi} (${r.tieteellinen})` : result.id
  const lines = [
    result.checked.length > 0
      ? `Vastauksesi sopivat lajiin ${name}.`
      : `Malli ehdottaa lajia ${name}. Et ole vielä vastannut yhteenkään tarkistukseen.`,
  ]
  const group = r ? GROUP_TEXT[r.ryhma] : undefined
  if (group) lines.push(group)
  if (result.openWarnings.length > 0) {
    const names = result.openWarnings.map((id) => {
      const w = species.get(id)
      return w ? `${w.nimi} (${w.ryhma})` : id
    })
    lines.push(`Avoimet varoitukset: ${names.join(', ')}.`)
  }
  lines.push(reminder)
  return lines
}
