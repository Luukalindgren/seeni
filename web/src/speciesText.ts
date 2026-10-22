// Species content per language (#52). species.json is Finnish and the source of all logic:
// class ids, groups, lookalikes and the answer keys of the checks. species.en.json holds the
// English texts by the same ids, and an answer's Finnish text is its key, so a translation
// never changes what a check rules out. Pure, no DOM (tests/speciesText.test.ts). The
// translation's coverage is checked in CI by `python -m seeni.species check`.

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

/** A species name standing on its own, as a heading or a label: the first letter in upper
 * case, the rest as it is ("Mustatorvisieni", "Koivunpunikkitatti"). Names inside a sentence
 * stay in lower case, as Finnish writes them. */
export function asTitle(name: string): string {
  return name.charAt(0).toLocaleUpperCase() + name.slice(1)
}
