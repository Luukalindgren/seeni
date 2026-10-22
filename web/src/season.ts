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

// Finland's outline, coarse (within some kilometres of the border; [lat, lon], clockwise
// from Åland), with its coastal waters: a position outside it gives no region, so a photo
// from Estonia, Russia, Sweden or Norway is not compared with Finnish observations.
const FINLAND: [number, number][] = [
  [59.7, 19.3], [60.3, 19.0], [63.0, 20.3], [64.2, 21.0], [65.8, 24.1], [66.5, 23.8],
  [67.2, 23.6], [67.9, 23.6], [68.15, 23.1], [68.45, 22.0], [68.75, 21.0], [69.05, 20.5],
  [69.3, 21.3], [68.75, 22.4], [68.7, 23.9], [68.9, 24.9], [69.4, 25.8], [69.85, 26.6],
  [70.15, 27.7], [70.05, 28.4], [69.8, 29.1], [69.1, 28.9], [68.9, 28.4], [68.1, 30.0], [67.6, 30.0],
  [66.9, 29.1], [66.0, 30.1], [65.2, 29.6], [64.0, 30.6], [62.9, 31.6], [61.3, 29.3],
  [60.45, 27.8], [59.75, 22.8],
]

function inFinland(lat: number, lon: number): boolean {
  let inside = false
  for (let i = 0, j = FINLAND.length - 1; i < FINLAND.length; j = i++) {
    const [ai, oi] = FINLAND[i]!
    const [aj, oj] = FINLAND[j]!
    if (ai > lat !== aj > lat && lon < ((oj - oi) * (lat - ai)) / (aj - ai) + oi) inside = !inside
  }
  return inside
}

export function regionOf(lat: number, lon: number, regions: Region[] = REGIONS): RegionId | null {
  if (!inFinland(lat, lon)) return null
  return regions.find((r) => lat >= r.minLat && lat < r.maxLat)?.id ?? null
}

// A photo date this far from today is not trusted: a wrong camera clock, or an old photo
// whose season says little about a find today.
const MAX_AGE_DAYS = 400

/** The month (1–12) to compare with: the photo's, or today's when the photo has none or
 * its date is not trusted. */
export function monthOf(taken: Date | null, now: Date): number {
  return taken && isRecent(taken, now) ? taken.getMonth() + 1 : now.getMonth() + 1
}

export function isRecent(taken: Date, now: Date): boolean {
  return Math.abs(now.getTime() - taken.getTime()) < MAX_AGE_DAYS * 86_400_000
}

// Too few observations say nothing about a season.
export const MIN_OBSERVATIONS = 50
// Rare: under this share of the expected count (see isRare).
export const RARE_SHARE = 0.2

// All observations per region, of every class: how much is observed there.
const efforts = new WeakMap<Occurrence, number[]>()
function regionEffort(table: Occurrence): number[] {
  let effort = efforts.get(table)
  if (!effort) {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const all = Object.values(table.classes)
    effort = table.regions.map((_, i) => sum(all.map((r) => sum(r[i] ?? []))))
    efforts.set(table, effort)
  }
  return effort
}

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
    count = rows[index]?.[month - 1] ?? 0
    const effort = regionEffort(table)
    const everything = sum(effort)
    share = everything > 0 ? effort[index]! / everything : 0
  } else {
    count = sum(rows.map((r) => r[month - 1] ?? 0))
  }
  const expected = (total * share) / 12
  return (count + 1) / (expected + 1) < RARE_SHARE
}
