// Species content per language (#52). species.json is Finnish and the source of all logic:
// class ids, groups, lookalikes and the answer keys of the checks. species.en.json holds the
// English texts by the same ids, and an answer's Finnish text is its key, so a translation
// never changes what a check rules out. Pure, no DOM (tests/speciesText.test.ts).

import type { Check, SpeciesRecord } from './flow.ts'
import type { Lang } from './i18n.ts'

export interface Translation {
  records: Record<string, { nimi: string; tuntomerkit: string[] }>
  checks: Record<string, { kysymys: string; vastaukset: Record<string, string> }>
}

/** The records with their texts in `lang`. Ids, groups, lookalikes, answer keys and the
 * classes under each answer stay exactly as they are. */
export function localizeRecords(records: SpeciesRecord[], lang: Lang, en: Translation): SpeciesRecord[] {
  if (lang === 'fi') return records
  return records.map((r) => {
    const tr = en.records[r.id]
    return {
      ...r,
      nimi: tr?.nimi ?? r.tieteellinen,
      tuntomerkit: tr?.tuntomerkit ?? r.tuntomerkit,
      tarkistukset: r.tarkistukset.map((c) => ({ ...c, kysymys: en.checks[c.id]?.kysymys ?? c.kysymys })),
    }
  })
}

/** The text of an answer, shown on its button: the key itself in Finnish. */
export function answerText(check: Pick<Check, 'id'>, key: string, lang: Lang, en: Translation): string {
  if (lang === 'fi') return key
  return en.checks[check.id]?.vastaukset[key] ?? key
}

/** What is missing from or extra in a translation; empty when it matches the records. */
export function translationProblems(records: SpeciesRecord[], en: Translation): string[] {
  const out: string[] = []
  const checks = new Map<string, Check>()
  for (const r of records) {
    const tr = en.records[r.id]
    if (!tr?.nimi) out.push(`record ${r.id}: no English name`)
    else if (tr.tuntomerkit.length !== r.tuntomerkit.length) out.push(`record ${r.id}: ${tr.tuntomerkit.length} features, Finnish has ${r.tuntomerkit.length}`)
    for (const c of r.tarkistukset) checks.set(c.id, c)
  }
  for (const id of Object.keys(en.records)) if (!records.some((r) => r.id === id)) out.push(`record ${id}: not in species.json`)
  for (const c of checks.values()) {
    const tr = en.checks[c.id]
    if (!tr?.kysymys) {
      out.push(`check ${c.id}: no English question`)
      continue
    }
    const keys = Object.keys(c.vastaukset)
    for (const k of keys) if (!tr.vastaukset[k]) out.push(`check ${c.id}: no English text for "${k}"`)
    for (const k of Object.keys(tr.vastaukset)) if (!keys.includes(k)) out.push(`check ${c.id}: "${k}" is not an answer`)
  }
  for (const id of Object.keys(en.checks)) if (!checks.has(id)) out.push(`check ${id}: not in species.json`)
  return out
}
