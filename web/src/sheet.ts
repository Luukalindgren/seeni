// The identification sheet of one species, opened from the result (#47): what the modal
// shows, as plain data, so that it is unit tested (tests/sheet.test.ts). Pure, no DOM.
//
// Safety (hard rule 8): nothing here states that a species is edible, a syötävä class gets
// no group label, and opening a sheet changes nothing in the flow.

import { DANGEROUS, mentioned, type Check, type Group, type Species } from './flow.ts'

export const GROUP_LABEL: Partial<Record<Group, string>> = {
  tappava: 'Tappavan myrkyllinen',
  myrkyllinen: 'Myrkyllinen',
  esikäsiteltävä: 'Myrkyllinen raakana',
}

/** One check that tells two classes apart: the answers that fit each of them. */
export interface Difference {
  check: Check
  self: string[]
  other: string[]
}

/** The checks of either record that separate `a` from `b`: both are mentioned, and they do
 * not fit exactly the same answers. A check that does not mention one of them says nothing
 * about it, so it is left out. */
export function differences(a: string, b: string, species: Species): Difference[] {
  const seen = new Map<string, Check>()
  for (const id of [a, b]) {
    for (const c of species.get(id)?.tarkistukset ?? []) if (!seen.has(c.id)) seen.set(c.id, c)
  }
  const out: Difference[] = []
  for (const check of seen.values()) {
    const all = mentioned(check)
    if (!all.has(a) || !all.has(b)) continue
    const answers = Object.keys(check.vastaukset)
    const self = answers.filter((x) => check.vastaukset[x]!.includes(a))
    const other = answers.filter((x) => check.vastaukset[x]!.includes(b))
    if (self.length === other.length && self.every((x) => other.includes(x))) continue
    out.push({ check, self, other })
  }
  return out
}

export interface Sheet {
  id: string
  nimi: string
  tieteellinen: string
  // The danger label, or null for a class that is not dangerous (never an edibility label).
  label: string | null
  dangerous: boolean
  // True for a warning-only record: the model cannot recognize it from a photo.
  warningOnly: boolean
  tuntomerkit: string[]
  // How it differs from the species of the result, when that is another class.
  compareTo: { id: string; nimi: string; differences: Difference[] } | null
  lookalikes: { id: string; nimi: string; label: string | null }[]
  lahteet: string[]
}

export function sheet(id: string, compareTo: string | null, species: Species, modelClasses: ReadonlySet<string>): Sheet {
  const r = species.get(id)
  if (!r) throw new Error(`no species record for ${id}`)
  const other = compareTo && compareTo !== id ? species.get(compareTo) : undefined
  return {
    id,
    nimi: r.nimi,
    tieteellinen: r.tieteellinen,
    label: GROUP_LABEL[r.ryhma] ?? null,
    dangerous: DANGEROUS.has(r.ryhma),
    warningOnly: !modelClasses.has(id),
    tuntomerkit: r.tuntomerkit,
    compareTo: other ? { id: other.id, nimi: other.nimi, differences: differences(id, other.id, species) } : null,
    lookalikes: r.kaksoisolennot.map((x) => {
      const l = species.get(x)
      return { id: x, nimi: l?.nimi ?? x, label: l ? (GROUP_LABEL[l.ryhma] ?? null) : null }
    }),
    lahteet: r.lahteet,
  }
}

/** Every string of a sheet that the user sees, for the edibility test. */
export function sheetTexts(s: Sheet): string[] {
  const out = [s.nimi, s.tieteellinen, ...s.tuntomerkit, ...s.lahteet]
  if (s.label) out.push(s.label)
  for (const l of s.lookalikes) out.push(l.nimi, ...(l.label ? [l.label] : []))
  if (s.compareTo) {
    out.push(s.compareTo.nimi)
    for (const d of s.compareTo.differences) out.push(d.check.kysymys, ...d.self, ...d.other)
  }
  return out
}
