// Time of year and region (#48): whether a suggested species is rarely found in Finland in
// that region and month, from GBIF observation counts (public/occurrence.json, made by
// training/src/seeni/occurrence.py). Pure, no DOM (tests/season.test.ts).
//
// Safety (hard rule 8): this only adds a note to a species that is not dangerous. It never
// changes the candidates, their order, the warnings or the checks, so it cannot hide a
// dangerous lookalike or make a result look more certain.
//
// Privacy (hard rule 9): a position is reduced to its region at once and a date to its
// month; nothing more precise is kept, and nothing leaves the device.

export interface Region {
  id: RegionId
  minLat: number
  maxLat: number
}
export type RegionId = 'etela' | 'keski' | 'pohjoinen'

export interface Occurrence {
  regions: Region[]
  // Per class: one row of 12 monthly counts (January first) per region, in region order.
  classes: Record<string, number[][]>
}

// The regions of occurrence.json, the same as REGIONS in training/src/seeni/occurrence.py.
export const REGIONS: Region[] = [
  { id: 'etela', minLat: 59.0, maxLat: 62.0 },
  { id: 'keski', minLat: 62.0, maxLat: 65.0 },
  { id: 'pohjoinen', minLat: 65.0, maxLat: 71.0 },
]

// Finland, roughly: a position outside it gives no region, so a photo from abroad is not
// compared with Finnish observations.
const FINLAND = { minLat: 59.4, maxLat: 70.2, minLon: 19.0, maxLon: 31.6 }

export function regionOf(lat: number, lon: number, regions: Region[] = REGIONS): RegionId | null {
  const f = FINLAND
  if (lat < f.minLat || lat > f.maxLat || lon < f.minLon || lon > f.maxLon) return null
  return regions.find((r) => lat >= r.minLat && lat < r.maxLat)?.id ?? null
}

// A photo date this far from today is not trusted: a wrong camera clock, or an old photo
// whose season says little about a find today.
const MAX_AGE_DAYS = 400

/** The month (1–12) to compare with: the photo's, or today's when the photo has none or
 * its date is not trusted. */
export function monthOf(taken: Date | null, now: Date): number {
  if (taken && Math.abs(now.getTime() - taken.getTime()) < MAX_AGE_DAYS * 86_400_000) return taken.getMonth() + 1
  return now.getMonth() + 1
}

// Too few observations say nothing about a season.
export const MIN_OBSERVATIONS = 50
// Rare: under this share of the expected count (see isRare).
export const RARE_SHARE = 0.2

/** True when the class is rarely observed in the month (and the region, when known). The
 * count there, smoothed, is compared with what the class's observations in all of Finland
 * would give if they were spread evenly over the months and over the regions in proportion
 * to how much is observed in each (most observers are in the south). */
export function isRare(table: Occurrence, classId: string, month: number, region: RegionId | null): boolean {
  const rows = table.classes[classId]
  if (!rows || month < 1 || month > 12) return false
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const total = sum(rows.map(sum))
  if (total < MIN_OBSERVATIONS) return false
  const index = region ? table.regions.findIndex((r) => r.id === region) : -1
  let count: number
  let share = 1
  if (index >= 0) {
    count = rows[index]![month - 1] ?? 0
    const all = Object.values(table.classes)
    const effort = (i: number) => sum(all.map((r) => sum(r[i] ?? [])))
    const everything = sum(table.regions.map((_, i) => effort(i)))
    share = everything > 0 ? effort(index) / everything : 0
  } else {
    count = sum(rows.map((r) => r[month - 1] ?? 0))
  }
  const expected = (total * share) / 12
  return (count + 1) / (expected + 1) < RARE_SHARE
}
